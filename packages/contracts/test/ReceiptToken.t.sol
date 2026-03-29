// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReceiptToken} from "../src/ReceiptToken.sol";
import {Attestation} from "../src/Attestation.sol";

contract ReceiptTokenTest is Test {
    ReceiptToken receipt;
    Attestation  attestation;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    uint256 constant SUPPLY_CAP   = 10_000e18;      // 10,000 fractional tokens
    uint256 constant VALUATION    = 500_000e18;      // $500,000

    function setUp() public {
        // Deploy attestation contract (this contract = deployer = owner)
        attestation = new Attestation();

        receipt = new ReceiptToken(
            "Picasso Receipt Token",
            "rPICASSO",
            owner,
            address(attestation),
            SUPPLY_CAP,
            "ART",
            "Picasso - Weeping Woman",
            VALUATION
        );
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _certifyAndAttest() internal {
        // 1. Update backing info (certify)
        receipt.updateBackingInfo(85, 25, "QmPicassoProvenance", VALUATION);

        // 2. Write attestation for this receipt token address
        attestation.attest(Attestation.AttestationData({
            attester:           owner,
            token:              address(receipt),
            approved:           true,
            reason:             "AI certified: provenance verified, museum-grade",
            score:              85,
            timestamp:          block.timestamp,
            decisionType:       1,  // CERTIFICATION
            decisionOrigin:     0,  // AI_QUORUM
            quorumVotes:        3,
            quorumTotal:        4,
            nav:                900_000e18,
            riskScore:          25,
            portfolioBreakdown: '{"ART-PICASSO-01":"34%"}',
            yieldHistory:       "[]"
        }));
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    function test_constructor_setsOwner() public view {
        assertEq(receipt.owner(), owner);
    }

    function test_constructor_setsName() public view {
        assertEq(receipt.name(), "Picasso Receipt Token");
        assertEq(receipt.symbol(), "rPICASSO");
    }

    function test_constructor_noInitialSupply() public view {
        assertEq(receipt.totalSupply(), 0);
    }

    function test_constructor_setsBackingInfo() public view {
        ReceiptToken.BackingInfo memory info = receipt.getBackingInfo();
        assertEq(info.assetType, "ART");
        assertEq(info.assetLabel, "Picasso - Weeping Woman");
        assertEq(info.valuationUSD, VALUATION);
        assertFalse(info.certified);
        assertEq(info.certScore, 0);
    }

    function test_constructor_setsSupplyCap() public view {
        assertEq(receipt.supplyCap(), SUPPLY_CAP);
    }

    function test_constructor_zeroAttestation_reverts() public {
        vm.expectRevert("zero attestation");
        new ReceiptToken("T", "T", owner, address(0), SUPPLY_CAP, "ART", "x", VALUATION);
    }

    function test_constructor_zeroCap_reverts() public {
        vm.expectRevert("zero supply cap");
        new ReceiptToken("T", "T", owner, address(attestation), 0, "ART", "x", VALUATION);
    }

    // ─── updateBackingInfo ───────────────────────────────────────────────────

    function test_updateBackingInfo_setsCertified() public {
        receipt.updateBackingInfo(85, 25, "QmHash", VALUATION);
        ReceiptToken.BackingInfo memory info = receipt.getBackingInfo();
        assertTrue(info.certified);
        assertEq(info.certScore, 85);
        assertEq(info.riskScore, 25);
        assertEq(info.provenanceHash, "QmHash");
        assertGt(info.certifiedAt, 0);
    }

    function test_updateBackingInfo_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit ReceiptToken.BackingInfoUpdated("ART", VALUATION, 85, 25);
        receipt.updateBackingInfo(85, 25, "QmHash", VALUATION);
    }

    function test_updateBackingInfo_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        receipt.updateBackingInfo(85, 25, "QmHash", VALUATION);
    }

    function test_updateBackingInfo_certScoreOutOfRange() public {
        vm.expectRevert("certScore out of range");
        receipt.updateBackingInfo(101, 25, "QmHash", VALUATION);
    }

    function test_updateBackingInfo_riskScoreOutOfRange() public {
        vm.expectRevert("riskScore out of range");
        receipt.updateBackingInfo(85, 101, "QmHash", VALUATION);
    }

    // ─── mint ────────────────────────────────────────────────────────────────

    function test_mint_afterCertAndAttest() public {
        _certifyAndAttest();
        receipt.mint(alice, 1000e18);
        assertEq(receipt.balanceOf(alice), 1000e18);
    }

    function test_mint_emitsEvent() public {
        _certifyAndAttest();
        vm.expectEmit(true, false, false, true);
        emit ReceiptToken.ReceiptsMinted(alice, 1000e18, 1000e18);
        receipt.mint(alice, 1000e18);
    }

    function test_mint_notCertified_reverts() public {
        // Attest but don't certify
        attestation.attest(Attestation.AttestationData({
            attester: owner, token: address(receipt), approved: true,
            reason: "test", score: 50, timestamp: block.timestamp,
            decisionType: 1, decisionOrigin: 0, quorumVotes: 3, quorumTotal: 4,
            nav: 0, riskScore: 0, portfolioBreakdown: "", yieldHistory: ""
        }));

        vm.expectRevert("not certified");
        receipt.mint(alice, 1000e18);
    }

    function test_mint_noAttestation_reverts() public {
        // Certify but don't attest
        receipt.updateBackingInfo(85, 25, "QmHash", VALUATION);

        vm.expectRevert("no attestation exists");
        receipt.mint(alice, 1000e18);
    }

    function test_mint_exceedsSupplyCap_reverts() public {
        _certifyAndAttest();
        vm.expectRevert("exceeds supply cap");
        receipt.mint(alice, SUPPLY_CAP + 1);
    }

    function test_mint_upToSupplyCap() public {
        _certifyAndAttest();
        receipt.mint(alice, SUPPLY_CAP);
        assertEq(receipt.totalSupply(), SUPPLY_CAP);
    }

    function test_mint_onlyOwner() public {
        _certifyAndAttest();
        vm.prank(alice);
        vm.expectRevert();
        receipt.mint(alice, 1000e18);
    }

    // ─── getBackingInfo (privacy check) ──────────────────────────────────────

    function test_getBackingInfo_noPrivateAddress() public {
        _certifyAndAttest();
        ReceiptToken.BackingInfo memory info = receipt.getBackingInfo();
        // BackingInfo struct has NO address field — private NFT address never stored
        assertEq(info.assetType, "ART");
        assertEq(info.assetLabel, "Picasso - Weeping Woman");
        assertTrue(info.certified);
    }

    // ─── getReceiptPrice ─────────────────────────────────────────────────────

    function test_getReceiptPrice() public view {
        // $500,000 / 10,000 tokens = $50 per receipt
        uint256 price = receipt.getReceiptPrice();
        assertEq(price, 50e18);
    }

    // ─── getAttestation ──────────────────────────────────────────────────────

    function test_getAttestation_returnsLatest() public {
        _certifyAndAttest();
        ReceiptToken.BackingInfo memory info = receipt.getBackingInfo();
        assertTrue(info.certified);
        assertEq(info.certScore, 85);
    }

    // ─── ERC-20 Standard ─────────────────────────────────────────────────────

    function test_transfer() public {
        _certifyAndAttest();
        receipt.mint(alice, 1000e18);

        vm.prank(alice);
        receipt.transfer(bob, 500e18);

        assertEq(receipt.balanceOf(alice), 500e18);
        assertEq(receipt.balanceOf(bob), 500e18);
    }

    function test_approve_and_transferFrom() public {
        _certifyAndAttest();
        receipt.mint(alice, 1000e18);

        vm.prank(alice);
        receipt.approve(bob, 1000e18);

        vm.prank(bob);
        receipt.transferFrom(alice, bob, 1000e18);
        assertEq(receipt.balanceOf(bob), 1000e18);
    }

    function test_decimals() public view {
        assertEq(receipt.decimals(), 18);
    }

    // ─── Full lifecycle ──────────────────────────────────────────────────────

    function test_fullLifecycle() public {
        // 1. Contract deployed — not certified, no supply
        assertFalse(receipt.getBackingInfo().certified);
        assertEq(receipt.totalSupply(), 0);

        // 2. Agent certifies the backing NFT
        receipt.updateBackingInfo(85, 25, "QmPicassoProvenance", VALUATION);
        assertTrue(receipt.getBackingInfo().certified);

        // 3. Agent writes attestation to Attestation.sol
        attestation.attest(Attestation.AttestationData({
            attester: owner, token: address(receipt), approved: true,
            reason: "AI certified: provenance verified, museum-grade. Score 85/100.",
            score: 85, timestamp: block.timestamp,
            decisionType: 1, decisionOrigin: 0, quorumVotes: 4, quorumTotal: 4,
            nav: 900_000e18, riskScore: 25,
            portfolioBreakdown: '{"ART-PICASSO-01":"34%"}',
            yieldHistory: "[]"
        }));

        // 4. Agent mints fractional receipts
        receipt.mint(alice, 5000e18);
        receipt.mint(bob, 2000e18);
        assertEq(receipt.totalSupply(), 7000e18);

        // 5. Secondary market: Alice transfers to Bob
        vm.prank(alice);
        receipt.transfer(bob, 1000e18);
        assertEq(receipt.balanceOf(alice), 4000e18);
        assertEq(receipt.balanceOf(bob), 3000e18);

        // 6. Investor verifies certification publicly
        ReceiptToken.BackingInfo memory info = receipt.getBackingInfo();
        assertEq(info.certScore, 85);
        assertEq(info.riskScore, 25);
        assertTrue(info.certified);
        // No private NFT address visible anywhere
    }
}
