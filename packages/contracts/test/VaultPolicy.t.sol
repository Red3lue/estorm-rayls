// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultPolicy} from "../src/VaultPolicy.sol";
import {VaultLedger} from "../src/VaultLedger.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {MockDEX} from "../src/MockDEX.sol";
import {MockERC20} from "./mocks/Mocks.sol";

// ─── Test ─────────────────────────────────────────────────────────────────────

contract VaultPolicyTest is Test {
    VaultPolicy    policy;
    VaultLedger    ledger;
    PriceOracle    oracle;
    MockERC20      tokenA;
    MockERC20      tokenB;

    address manager = makeAddr("manager");
    address agent   = makeAddr("agent");
    address alice   = makeAddr("alice");

    // Token A: 18 decimals, price = 10_000 cents ($100/token)
    // 1_000 tokens → value = 1_000 * 10_000 = 10_000_000 cents ($100,000)
    uint256 constant TOKEN_A_PRICE    = 10_000;   // cents per whole token
    uint256 constant TOKEN_A_BALANCE  = 1_000e18; // 1,000 tokens in vault

    // Token B: 6 decimals, price = 100 cents ($1/token, stablecoin)
    uint256 constant TOKEN_B_PRICE    = 100;      // cents per whole token
    uint256 constant TOKEN_B_BALANCE  = 50_000e6; // 50,000 tokens in vault

    // THRESHOLD > token A value ($100k) so auto-exec is easy to test
    uint256 constant THRESHOLD = 5_000_000_00; // $5,000,000 in cents
    uint256 constant MAX_TX    = 10;
    uint256 constant WINDOW    = 3600;

    function setUp() public {
        oracle = new PriceOracle(address(this));
        tokenA = new MockERC20("Bond Gov 6M", 18);
        tokenB = new MockERC20("USDR Stable",  6);

        oracle.setPrice(address(tokenA), TOKEN_A_PRICE);
        oracle.setPrice(address(tokenB), TOKEN_B_PRICE);

        // Deploy ledger owned by test contract, set oracle
        ledger = new VaultLedger(address(this), address(oracle));
        // Deploy policy pointing to ledger
        policy = new VaultPolicy(manager, agent, address(ledger), THRESHOLD, MAX_TX, WINDOW);
        // Transfer ledger ownership to policy so forwarded calls pass onlyOwner
        ledger.transferOwnership(address(policy));

        // Fund vault with tokenA (tokens must be in vault before addERC20Asset)
        tokenA.mint(address(ledger), TOKEN_A_BALANCE);
        tokenB.mint(address(ledger), TOKEN_B_BALANCE);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// @dev addERC20Asset(address, string, uint8 riskScore, uint256 yieldBps)
    function _addTokenA() internal pure returns (bytes memory) {
        return abi.encodeWithSignature(
            "addERC20Asset(address,string,uint8,uint256)",
            address(0x1001), "BOND-GOV-6M", uint8(15), uint256(420)
        );
    }

    function _addTokenAReal() internal view returns (bytes memory) {
        return abi.encodeWithSignature(
            "addERC20Asset(address,string,uint8,uint256)",
            address(tokenA), "BOND-GOV-6M", uint8(15), uint256(420)
        );
    }

    function _addTokenBReal() internal view returns (bytes memory) {
        return abi.encodeWithSignature(
            "addERC20Asset(address,string,uint8,uint256)",
            address(tokenB), "USDR-STABLE", uint8(5), uint256(0)
        );
    }

    function _navUpdateCall() internal view returns (bytes memory) {
        address[] memory addrs     = new address[](0);
        uint8[]   memory risks     = new uint8[](0);
        uint256[] memory yields    = new uint256[](0);
        return abi.encodeWithSignature(
            "updatePortfolio(address[],uint8[],uint256[])",
            addrs, risks, yields
        );
    }

    // ── Value extraction ──────────────────────────────────────────────────────

    function test_extractValue_addERC20_usesOracleBalance() public {
        // tokenA has 1_000e18 balance in vault, price = 10_000 cents
        // expected = 1_000e18 * 10_000 / 1e18 = 10_000_000 cents ($100k)
        uint256 val = policy.extractValue(_addTokenAReal(), address(ledger));
        assertEq(val, 1_000 * TOKEN_A_PRICE);
    }

    function test_extractValue_swap_usesOracleAmount() public {
        // swap 500 tokenA → some tokenB
        // value of 500e18 tokenA at $100/token = 500 * 10_000 = 5_000_000 cents
        bytes memory swapCall = abi.encodeWithSignature(
            "swap(address,uint256,address,uint256,address)",
            address(tokenA), uint256(500e18), address(tokenB), uint256(50_000e6), address(0xDEA)
        );
        uint256 val = policy.extractValue(swapCall, address(ledger));
        assertEq(val, 500 * TOKEN_A_PRICE);
    }

    function test_extractValue_updatePortfolio_usesNAV() public {
        // Register tokenA first so there's a NAV
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.BOND, "add bond", 3);

        uint256 nav = policy.extractValue(_navUpdateCall(), address(ledger));
        assertGt(nav, 0);
    }

    // ── Auto-execution ────────────────────────────────────────────────────────

    function test_autoExec_executesCallOnTarget() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.BOND, "add bond", 3);
        assertEq(ledger.getERC20Count(), 1);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_autoExec_emitsEvent() public {
        vm.prank(agent);
        vm.expectEmit(true, false, false, false);
        emit VaultPolicy.ProposalAutoExecuted(1, VaultPolicy.AssetCategory.BOND, 3, 0, address(ledger));
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.BOND, "add bond", 3);
    }

    // ── Pending: call NOT executed until approved ─────────────────────────────

    function test_pending_aboveThreshold_doesNotExecute() public {
        // Add tokenA (value $100k < $5M threshold) to get NAV, then updatePortfolio has NAV > threshold
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.BOND, "add bond", 3);

        // Now set threshold very low so next proposal is above it
        vm.prank(manager);
        policy.setValueThreshold(500_00); // $500 — below $100k tokenA value

        // Proposing addTokenB (value $50k) is now above the new $500 threshold → pending
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenBReal(), VaultPolicy.AssetCategory.STABLECOIN, "add usdr", 2);
        assertEq(policy.pendingProposalId(), id);
    }

    function test_pending_artCategory_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "certify", 4);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), id);
    }

    function test_pending_blocksSecondPending() public {
        vm.startPrank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "first", 4);
        vm.expectRevert("pending proposal exists: resolve it first");
        policy.propose(address(ledger), _addTokenBReal(), VaultPolicy.AssetCategory.ART, "second", 4);
        vm.stopPrank();
    }

    function test_autoExecWhilePendingExists() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "pending", 4);

        bytes memory readCall = _navUpdateCall();
        vm.prank(agent);
        uint256 id2 = policy.propose(address(ledger), readCall, VaultPolicy.AssetCategory.NAV_UPDATE, "nav", 4);
        assertGt(id2, 1);
        assertEq(policy.pendingProposalId(), 1);
    }

    // ── Approve ───────────────────────────────────────────────────────────────

    function test_approve_executesCall() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        assertEq(ledger.getERC20Count(), 0);

        vm.prank(manager);
        policy.approve(id);

        assertEq(ledger.getERC20Count(), 1);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_approve_emitsEvent() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(manager);
        vm.expectEmit(true, true, false, false);
        emit VaultPolicy.ProposalApproved(id, manager);
        policy.approve(id);
    }

    function test_approve_revertsOnInvalidId() public {
        vm.prank(manager);
        vm.expectRevert("invalid id");
        policy.approve(99);
    }

    function test_approve_revertsIfAlreadyResolved() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(manager);
        policy.approve(1);
        vm.prank(manager);
        vm.expectRevert("not pending");
        policy.approve(1);
    }

    // ── Dismiss ───────────────────────────────────────────────────────────────

    function test_dismiss_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(manager);
        policy.dismiss(id);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), 0);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    function test_withdraw_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(agent);
        policy.withdraw(id);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_withdraw_onlyAgent() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(manager);
        vm.expectRevert("not agent");
        policy.withdraw(1);
    }

    // ── Selector allowlist ────────────────────────────────────────────────────

    function test_unknownSelector_reverts() public {
        vm.prank(agent);
        vm.expectRevert("selector not allowed");
        // transferOwnership — dangerous, must never be proposable
        policy.propose(
            address(ledger),
            abi.encodeWithSignature("transferOwnership(address)", address(0xdead)),
            VaultPolicy.AssetCategory.NAV_UPDATE, "hijack", 0
        );
    }

    function test_emptyCalldata_reverts() public {
        vm.prank(agent);
        vm.expectRevert("calldata too short");
        policy.propose(address(ledger), "", VaultPolicy.AssetCategory.BOND, "empty", 0);
    }

    function test_setAllowedSelector_addNew() public {
        bytes4 sel = bytes4(keccak256("someNewOp(uint256)"));
        assertFalse(policy.allowedSelectors(sel));
        vm.prank(manager);
        policy.setAllowedSelector(sel, true);
        assertTrue(policy.allowedSelectors(sel));
    }

    function test_setAllowedSelector_removeExisting() public {
        // Remove swap from whitelist
        vm.prank(manager);
        policy.setAllowedSelector(bytes4(keccak256("swap(address,uint256,address,uint256,address)")), false);

        bytes memory swapCall = abi.encodeWithSignature(
            "swap(address,uint256,address,uint256,address)",
            address(tokenA), uint256(100e18), address(tokenB), uint256(1_000e6), address(0xDEA)
        );
        vm.prank(agent);
        vm.expectRevert("selector not allowed");
        policy.propose(address(ledger), swapCall, VaultPolicy.AssetCategory.BOND, "swap", 3);
    }

    function test_setAllowedSelector_onlyManager() public {
        vm.prank(alice);
        vm.expectRevert("not manager");
        policy.setAllowedSelector(bytes4(keccak256("anything()")), true);
    }

    function test_dewhitelisted_pendingProposal_revertsOnApprove() public {
        // Queue a proposal
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);

        // Manager de-whitelists the selector after queuing
        vm.prank(manager);
        policy.setAllowedSelector(bytes4(keccak256("addERC20Asset(address,string,uint8,uint256)")), false);

        // Approval should revert at _execute's defense-in-depth check
        vm.prank(manager);
        vm.expectRevert("selector not allowed");
        policy.approve(id);
    }

    // ── Execution failure propagates ──────────────────────────────────────────

    function test_badCallReverts() public {
        // whitelisted selector but the actual call fails (e.g. wrong args)
        bytes memory badArgs = abi.encodeWithSignature(
            "addERC20Asset(address,string,uint8,uint256)",
            address(0), "BAD", uint8(0), uint256(0)  // zero address → reverts in VaultLedger
        );
        vm.prank(agent);
        vm.expectRevert();
        policy.propose(address(ledger), badArgs, VaultPolicy.AssetCategory.BOND, "bad", 3);
    }

    // ── Rate limit ────────────────────────────────────────────────────────────

    function test_rateLimitBlocks() public {
        bytes memory cd = _navUpdateCall();
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "t", 3);
        }
        uint256 id = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "11th", 3);
        assertEq(policy.pendingProposalId(), id);
        vm.stopPrank();
    }

    // ── Emergency stop ────────────────────────────────────────────────────────

    function test_emergencyStop_blocksPropose() public {
        vm.prank(manager);
        policy.emergencyStop();
        vm.prank(agent);
        vm.expectRevert("emergency stop active");
        policy.propose(address(ledger), _navUpdateCall(), VaultPolicy.AssetCategory.BOND, "", 3);
    }

    function test_emergencyStop_blocksApprove() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "art", 4);
        vm.prank(manager);
        policy.emergencyStop();
        vm.prank(manager);
        vm.expectRevert("emergency stop active");
        policy.approve(1);
    }

    function test_resume() public {
        vm.prank(manager);
        policy.emergencyStop();
        vm.prank(manager);
        policy.resume();
        (,,,bool paused) = policy.settings();
        assertFalse(paused);
    }

    // ── Access control ────────────────────────────────────────────────────────

    function test_onlyAgent_propose() public {
        vm.prank(alice);
        vm.expectRevert("not agent");
        policy.propose(address(ledger), _navUpdateCall(), VaultPolicy.AssetCategory.BOND, "", 0);
    }

    function test_onlyManager_approve() public { vm.prank(alice); vm.expectRevert("not manager"); policy.approve(1); }
    function test_onlyManager_dismiss() public  { vm.prank(alice); vm.expectRevert("not manager"); policy.dismiss(1); }
    function test_onlyAgent_withdraw() public   { vm.prank(alice); vm.expectRevert("not agent");   policy.withdraw(1); }

    // ── Read ──────────────────────────────────────────────────────────────────

    function test_getSettings() public view {
        (VaultPolicy.GovernanceSettings memory s, bool[6] memory perms) = policy.getSettings();
        assertEq(s.valueThreshold, THRESHOLD);
        assertEq(s.maxTxPerWindow, MAX_TX);
        assertTrue(perms[0]);   // BOND
        assertFalse(perms[3]);  // ART
    }

    function test_getPendingProposal() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "certify Picasso", 4);
        VaultPolicy.Proposal memory p = policy.getPendingProposal();
        assertEq(p.id,        1);
        assertEq(p.reasoning, "certify Picasso");
        assertEq(p.target,    address(ledger));
    }

    function test_getPendingProposal_revertsIfNone() public {
        vm.expectRevert("no pending proposal");
        policy.getPendingProposal();
    }

    function test_getProposalHistory() public {
        bytes memory cd = _navUpdateCall();
        vm.prank(agent);
        policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "auto", 3);
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "pending", 4);
        VaultPolicy.Proposal[] memory h = policy.getProposalHistory();
        assertEq(h.length, 2);
        assertEq(uint8(h[0].status), uint8(VaultPolicy.ProposalStatus.AUTO_EXECUTED));
        assertEq(uint8(h[1].status), uint8(VaultPolicy.ProposalStatus.PENDING));
    }

    function test_setValueThreshold() public {
        vm.prank(manager);
        policy.setValueThreshold(1_000_000_00);
        (uint256 vt,,,) = policy.settings();
        assertEq(vt, 1_000_000_00);
    }

    function test_setCategoryPermission_artToAiManaged() public {
        vm.prank(manager);
        policy.setCategoryPermission(VaultPolicy.AssetCategory.ART, true);
        assertTrue(policy.categoryPermissions(VaultPolicy.AssetCategory.ART));
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.ART, "certify", 4);
        assertEq(policy.pendingProposalId(), 0);
        assertGt(id, 0);
    }

    function test_getRateLimitStatus() public {
        bytes memory cd = _navUpdateCall();
        vm.startPrank(agent);
        policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "t1", 3);
        policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "t2", 3);
        vm.stopPrank();
        (uint256 used, uint256 max,) = policy.getRateLimitStatus();
        assertEq(used, 2);
        assertEq(max, MAX_TX);
    }

    function test_rateLimitResetsAfterWindow() public {
        bytes memory cd = _navUpdateCall();
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "t", 3);
        }
        uint256 pendingId = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "11th", 3);
        vm.stopPrank();
        vm.prank(manager);
        policy.dismiss(pendingId);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, "new window", 3);
        assertEq(policy.pendingProposalId(), 0);
        assertGt(id, 0);
    }

    // ── Swap via VaultLedger ──────────────────────────────────────────────────

    function test_swap_executesViaPolicy() public {
        MockDEX dex = new MockDEX();

        // Fund DEX with tokenB reserves (so it can fulfill the swap)
        tokenB.mint(address(dex), 50_000e6);

        // Register both assets in ledger via policy
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenAReal(), VaultPolicy.AssetCategory.BOND, "add A", 3);
        vm.prank(agent);
        policy.propose(address(ledger), _addTokenBReal(), VaultPolicy.AssetCategory.STABLECOIN, "add B", 2);

        uint256 navBefore = ledger.getNAV();

        // Propose swap: sell 100 tokenA for 10,000 tokenB
        bytes memory swapCall = abi.encodeWithSignature(
            "swap(address,uint256,address,uint256,address)",
            address(tokenA), uint256(100e18), address(tokenB), uint256(10_000e6), address(dex)
        );
        vm.prank(agent);
        policy.propose(address(ledger), swapCall, VaultPolicy.AssetCategory.BOND, "rebalance to stables", 3);

        // Vault should now have 900 tokenA and 60,000 tokenB
        assertEq(tokenA.balanceOf(address(ledger)), TOKEN_A_BALANCE - 100e18);
        assertEq(tokenB.balanceOf(address(ledger)), TOKEN_B_BALANCE + 10_000e6);
    }
}
