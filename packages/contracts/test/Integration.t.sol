// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

// Privacy Node contracts
import {VaultLedger}    from "../src/VaultLedger.sol";
import {VaultPolicy}    from "../src/VaultPolicy.sol";
import {DvPExchange}    from "../src/DvPExchange.sol";
import {PriceOracle}    from "../src/PriceOracle.sol";
import {MockERC20}      from "./mocks/Mocks.sol";

// Public Chain contracts
import {Attestation}       from "../src/Attestation.sol";
import {VaultShareToken}   from "../src/VaultShareToken.sol";
import {ReceiptToken}      from "../src/ReceiptToken.sol";
import {Marketplace}       from "../src/Marketplace.sol";

/// @title Integration Test — Full Protocol Lifecycle
/// @notice Simulates the entire Sovereign Vault flow:
///         1. Deploy all contracts (Privacy Node + Public Chain)
///         2. Agent observes vault → NAV computed from oracle
///         3. Agent rebalances via VaultPolicy (auto-execute)
///         4. Large trade queued for human approval
///         5. DvP atomic swap through governance
///         6. Agent certifies NFT + attests on Public Chain
///         7. Agent issues receipt tokens (gated by attestation)
///         8. Agent lists tokens on marketplace
///         9. Investor buys vault shares + receipt tokens
///         10. Market shock → agent delists
contract IntegrationTest is Test {

    // ─── Roles ───────────────────────────────────────────────────────────────

    address manager = address(0xAAAA);
    address agent   = address(0xBBBB);
    address investor = address(0xCCCC);
    address counterparty = address(0xDDDD);

    // ─── Privacy Node Contracts ──────────────────────────────────────────────

    PriceOracle  oracle;
    VaultLedger  ledger;
    VaultPolicy  policy;
    DvPExchange  dvp;

    MockERC20 bondGov;
    MockERC20 recvAcme;
    MockERC20 recvBeta;
    MockERC20 stableUsdr;

    // ─── Public Chain Contracts ──────────────────────────────────────────────

    Attestation      attestation;
    VaultShareToken  vaultShares;
    ReceiptToken     receiptToken;
    Marketplace      marketplace;

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 constant BOND_PRICE    = 100_000;  // $1,000/token in cents
    uint256 constant RECV_PRICE    =  50_000;  // $500/token
    uint256 constant STABLE_PRICE  =     100;  // $1.00/token
    uint256 constant VALUE_THRESHOLD  = 5_000_000; // $50,000 in cents
    uint256 constant SETUP_THRESHOLD  = type(uint256).max; // unlimited during setup

    // ─── Setup ───────────────────────────────────────────────────────────────

    function setUp() public {
        // Fund roles
        vm.deal(agent, 100 ether);
        vm.deal(investor, 10_000 ether);
        vm.deal(manager, 10 ether);

        // ── Privacy Node: Deploy tokens ──────────────────────────────────────
        bondGov    = new MockERC20("BOND-GOV-6M",   18);
        recvAcme   = new MockERC20("RECV-ACME-90D", 18);
        recvBeta   = new MockERC20("RECV-BETA-30D", 18);
        stableUsdr = new MockERC20("STABLE-USDr",    6);

        // ── Privacy Node: Deploy oracle (manager-controlled) ─────────────────
        oracle = new PriceOracle(manager);
        vm.startPrank(manager);
        oracle.setPrice(address(bondGov),   BOND_PRICE);
        oracle.setPrice(address(recvAcme),  RECV_PRICE);
        oracle.setPrice(address(recvBeta),  RECV_PRICE);
        oracle.setPrice(address(stableUsdr), STABLE_PRICE);
        vm.stopPrank();

        // ── Privacy Node: Deploy VaultLedger ─────────────────────────────────
        ledger = new VaultLedger(address(this), address(oracle));

        // ── Privacy Node: Deploy VaultPolicy (high threshold for setup) ──────
        policy = new VaultPolicy(
            manager,           // fund manager
            agent,             // AI agent
            address(ledger),   // VaultLedger for value checks
            SETUP_THRESHOLD,   // unlimited during setup registration
            100,               // generous rate limit for setup
            3600               // 1 hour window
        );

        // Transfer VaultLedger ownership to VaultPolicy
        ledger.transferOwnership(address(policy));

        // ── Privacy Node: Deploy DvP Exchange ────────────────────────────────
        dvp = new DvPExchange();

        // ── Seed vault with tokens ───────────────────────────────────────────
        // Transfer tokens to VaultLedger (custodian model)
        bondGov.mint(address(ledger),    350e18);   // 350 bonds = $350K
        recvAcme.mint(address(ledger),   400e18);   // 400 receivables = $200K
        recvBeta.mint(address(ledger),   300e18);   // 300 receivables = $150K
        stableUsdr.mint(address(ledger), 200_000e6); // 200K stables = $200K

        // Register assets via VaultPolicy (agent proposes, auto-executes)
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.addERC20Asset, (address(bondGov), "BOND-GOV-6M", 15, 420)),
            VaultPolicy.AssetCategory.BOND,
            "Register BOND-GOV"
        );
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.addERC20Asset, (address(recvAcme), "RECV-ACME-90D", 55, 1100)),
            VaultPolicy.AssetCategory.RECEIVABLE,
            "Register RECV-ACME"
        );
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.addERC20Asset, (address(recvBeta), "RECV-BETA-30D", 45, 800)),
            VaultPolicy.AssetCategory.RECEIVABLE,
            "Register RECV-BETA"
        );
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.addERC20Asset, (address(stableUsdr), "STABLE-USDr", 0, 0)),
            VaultPolicy.AssetCategory.STABLECOIN,
            "Register STABLE-USDr"
        );

        // ── Privacy Node: Lower threshold to production value ─────────────────
        vm.prank(manager);
        policy.setValueThreshold(VALUE_THRESHOLD);
        vm.prank(manager);
        policy.setRateLimit(10, 3600);

        // ── Public Chain: Deploy contracts ───────────────────────────────────
        // Attestation deployed by agent (immutable owner)
        vm.prank(agent);
        attestation = new Attestation();

        // VaultShareToken deployed by agent
        vm.prank(agent);
        vaultShares = new VaultShareToken(agent, 0, 10e18); // $10/share initial

        // ReceiptToken deployed by agent
        vm.prank(agent);
        receiptToken = new ReceiptToken(
            "Picasso Receipt Token",
            "rPICASSO",
            agent,
            address(attestation),
            10_000e18,        // 10K supply cap
            "ART",
            "Picasso - Weeping Woman",
            500_000e18        // $500K valuation
        );

        // Marketplace deployed by agent
        vm.prank(agent);
        marketplace = new Marketplace(agent);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    function _agentPropose(
        address target,
        bytes memory callData,
        VaultPolicy.AssetCategory category,
        string memory reasoning
    ) internal returns (uint256 id) {
        vm.prank(agent);
        id = policy.propose(target, callData, category, reasoning, 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 1: Full vault observation + NAV
    // ═══════════════════════════════════════════════════════════════════════════

    function test_01_vaultObservation_navFromOracle() public view {
        // NAV should be: 350*$1000 + 400*$500 + 300*$500 + 200K*$1 = $900K
        uint256 nav = ledger.getNAV();
        assertEq(nav, 90_000_000); // $900,000 in cents

        // Snapshot should return all 4 assets
        (VaultLedger.ERC20Asset[] memory f, ) = ledger.getVaultSnapshot();
        assertEq(f.length, 4);

        // Allocations should be correct
        // Bond: $350K / $900K ≈ 38%
        assertGe(f[0].allocationPct, 38);
        assertLe(f[0].allocationPct, 39);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 2: Auto-execute rebalance via VaultPolicy
    // ═══════════════════════════════════════════════════════════════════════════

    function test_02_largeValueGoesFromPending_managerApproves() public {
        // updatePortfolio value = whole NAV ($900K) > $50K threshold → PENDING
        address[] memory tokens = new address[](4);
        tokens[0] = address(bondGov);
        tokens[1] = address(recvAcme);
        tokens[2] = address(recvBeta);
        tokens[3] = address(stableUsdr);

        uint8[] memory risks = new uint8[](4);
        risks[0] = 15; risks[1] = 60; risks[2] = 45; risks[3] = 0;

        uint256[] memory yields = new uint256[](4);
        yields[0] = 420; yields[1] = 1100; yields[2] = 800; yields[3] = 0;

        uint256 pendingId = _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.updatePortfolio, (tokens, risks, yields)),
            VaultPolicy.AssetCategory.NAV_UPDATE,
            "AI_QUORUM (3/4): Refresh portfolio metadata"
        );

        // Value ($900K) > threshold ($50K) → PENDING
        VaultPolicy.Proposal memory p = policy.getPendingProposal();
        assertEq(uint8(p.status), uint8(VaultPolicy.ProposalStatus.PENDING));
        assertEq(p.valueUSD, 90_000_000); // derived on-chain

        // Manager approves
        vm.prank(manager);
        policy.approve(pendingId);

        // NAV unchanged (metadata refresh, no balance change)
        assertEq(ledger.getNAV(), 90_000_000);
        assertEq(policy.pendingProposalId(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 3: Large trade queued for human approval
    // ═══════════════════════════════════════════════════════════════════════════

    function test_03_largeTradeQueued_managerApproves() public {
        // Create a mock DEX for the swap
        MockDEX dex = new MockDEX();

        // Whitelist the DEX targets — agent proposes a swap
        // swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address dex)
        // Value = oracle price of 200e18 RECV-ACME = 200 * $500 = $100K → exceeds $50K threshold
        bytes memory swapCall = abi.encodeCall(
            VaultLedger.swap,
            (address(recvAcme), 200e18, address(stableUsdr), 100_000e6, address(dex))
        );

        uint256 pendingId = _agentPropose(
            address(ledger),
            swapCall,
            VaultPolicy.AssetCategory.RECEIVABLE,
            "AI_QUORUM (3/4): Sell 200 RECV-ACME for $100K STABLE-USDr"
        );

        // Should be PENDING (value $100K > $50K threshold)
        assertEq(policy.pendingProposalId(), pendingId);

        // Manager approves
        stableUsdr.mint(address(dex), 100_000e6); // DEX needs liquidity
        vm.prank(manager);
        policy.approve(pendingId);

        // Verify the swap executed
        assertEq(policy.pendingProposalId(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 4: DvP atomic swap through governance
    // ═══════════════════════════════════════════════════════════════════════════

    function test_04_dvpSwapViaPolicy() public {
        // Whitelist DvP exchange address
        // Agent proposes a DvP exchange: sell 50 BOND-GOV for 25K STABLE-USDr
        // createDvPExchange(tokenIn, amountIn, counterparty, tokenOut, amountOut, dvpExchange, expiration)
        bytes memory dvpCall = abi.encodeCall(
            VaultLedger.createDvPExchange,
            (address(bondGov), 50e18, counterparty, address(stableUsdr), 25_000e6, address(dvp), block.timestamp + 3600)
        );

        // Value = 50 bonds * $1000 = $50K = exactly threshold → auto-executes
        uint256 id = _agentPropose(
            address(ledger),
            dvpCall,
            VaultPolicy.AssetCategory.BOND,
            "AI_QUORUM (4/4): DvP swap 50 BOND for 25K STABLE"
        );

        // Value is exactly threshold, so auto-execute (<=)
        assertEq(policy.pendingProposalId(), 0);

        // Verify bond balance decreased (escrowed in DvP)
        assertEq(bondGov.balanceOf(address(ledger)), 300e18); // was 350, now 300

        // Counterparty settles
        stableUsdr.mint(counterparty, 25_000e6);
        vm.startPrank(counterparty);
        stableUsdr.approve(address(dvp), 25_000e6);
        dvp.executeExchange(0);
        vm.stopPrank();

        // VaultLedger received stables from settlement
        assertGt(stableUsdr.balanceOf(address(ledger)), 200_000e6);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 5: NFT certification → attestation → receipt issuance
    // ═══════════════════════════════════════════════════════════════════════════

    function test_05_certifyAndIssueReceipt() public {
        // Step 1: Agent certifies backing info on ReceiptToken
        vm.prank(agent);
        receiptToken.updateBackingInfo(
            85,                     // certScore
            25,                     // riskScore
            "QmPicassoProvenance",  // provenanceHash
            500_000e18              // valuationUSD
        );

        assertTrue(receiptToken.getBackingInfo().certified);

        // Step 2: Agent writes attestation on Public Chain
        vm.prank(agent);
        attestation.attest(Attestation.AttestationData({
            attester:           agent,
            token:              address(receiptToken),
            approved:           true,
            reason:             "AI_QUORUM (4/4): Certified Picasso provenance. Museum-grade.",
            score:              85,
            timestamp:          block.timestamp,
            decisionType:       1,  // CERTIFICATION
            decisionOrigin:     0,  // AI_QUORUM
            quorumVotes:        4,
            quorumTotal:        4,
            nav:                90_000_000,
            riskScore:          25,
            portfolioBreakdown: '{"BOND-GOV":"39%","RECV-ACME":"22%","RECV-BETA":"17%","STABLE":"22%"}',
            yieldHistory:       '[{"period":"week1","yield":"7.1%"}]'
        }));

        // Verify attestation exists
        assertEq(attestation.getAttestationCountForToken(address(receiptToken)), 1);

        // Step 3: Agent mints receipt tokens (both gates pass)
        vm.prank(agent);
        receiptToken.mint(investor, 5_000e18);

        assertEq(receiptToken.balanceOf(investor), 5_000e18);
        assertEq(receiptToken.getReceiptPrice(), 50e18); // $500K / 10K = $50

        // Step 4: Investor verifies certification on-chain (privacy preserved)
        ReceiptToken.BackingInfo memory info = receiptToken.getBackingInfo();
        assertEq(info.certScore, 85);
        assertEq(info.riskScore, 25);
        assertTrue(info.certified);
        assertEq(info.assetType, "ART");
        // NO private address exposed anywhere
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 6: Vault share purchase + marketplace flow
    // ═══════════════════════════════════════════════════════════════════════════

    function test_06_shareAndMarketplaceFlow() public {
        // Step 1: Investor buys vault shares ($1000 at $10/share = 100 shares)
        vm.prank(investor);
        vaultShares.buy{value: 1000e18}();
        assertEq(vaultShares.balanceOf(investor), 100e18);

        // Step 2: Agent updates NAV after deploying capital
        vm.prank(agent);
        vaultShares.updateNAV(1000e18);
        assertEq(vaultShares.getSharePrice(), 10e18); // $10/share

        // Step 3: NAV increases (vault assets appreciated)
        vm.prank(agent);
        vaultShares.updateNAV(1200e18);
        assertEq(vaultShares.getSharePrice(), 12e18); // $12/share

        // Step 4: Agent mints more shares to list on marketplace
        // First, certify + attest for receipt token
        vm.prank(agent);
        receiptToken.updateBackingInfo(85, 25, "QmPicasso", 500_000e18);
        vm.prank(agent);
        attestation.attest(Attestation.AttestationData({
            attester: agent, token: address(receiptToken), approved: true,
            reason: "Certified", score: 85, timestamp: block.timestamp,
            decisionType: 1, decisionOrigin: 0, quorumVotes: 4, quorumTotal: 4,
            nav: 90_000_000, riskScore: 25,
            portfolioBreakdown: "{}", yieldHistory: "[]"
        }));

        vm.prank(agent);
        receiptToken.mint(agent, 2_000e18);

        // Step 5: Agent lists receipt tokens on marketplace
        vm.startPrank(agent);
        receiptToken.approve(address(marketplace), 2_000e18);
        uint256 listingId = marketplace.list(
            address(receiptToken),
            Marketplace.AssetType.ERC20,
            0,
            2_000e18,
            100e18  // $100 total for 2000 tokens
        );
        vm.stopPrank();

        assertEq(marketplace.getActiveListings().length, 1);

        // Step 6: Investor buys from marketplace
        vm.prank(investor);
        marketplace.buy{value: 100e18}(listingId);

        assertEq(receiptToken.balanceOf(investor), 2_000e18);
        assertEq(marketplace.getActiveListings().length, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 7: Emergency stop halts all operations
    // ═══════════════════════════════════════════════════════════════════════════

    function test_07_emergencyStop() public {
        // Manager activates emergency stop
        vm.prank(manager);
        policy.emergencyStop();

        // Agent cannot propose anything
        vm.prank(agent);
        vm.expectRevert("emergency stop active");
        policy.propose(
            address(ledger),
            abi.encodeCall(VaultLedger.recordTrade, (VaultLedger.TradeAction.REBALANCE, "test", 0, 3, false)),
            VaultPolicy.AssetCategory.BOND,
            "should fail",
            3
        );

        // Manager resumes
        vm.prank(manager);
        policy.resume();

        // Agent can propose again
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.recordTrade, (VaultLedger.TradeAction.REBALANCE, "resumed", 0, 3, false)),
            VaultPolicy.AssetCategory.BOND,
            "after resume"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 8: Pending proposal → agent withdraws after state change
    // ═══════════════════════════════════════════════════════════════════════════

    function test_08_pendingProposal_agentWithdraws() public {
        // Agent proposes a large trade → PENDING
        address[] memory tokens = new address[](4);
        tokens[0] = address(bondGov);
        tokens[1] = address(recvAcme);
        tokens[2] = address(recvBeta);
        tokens[3] = address(stableUsdr);
        uint8[] memory risks = new uint8[](4);
        risks[0] = 15; risks[1] = 60; risks[2] = 45; risks[3] = 0;
        uint256[] memory yields = new uint256[](4);
        yields[0] = 420; yields[1] = 1100; yields[2] = 800; yields[3] = 0;

        uint256 pendingId = _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.updatePortfolio, (tokens, risks, yields)),
            VaultPolicy.AssetCategory.NAV_UPDATE,
            "Large update"
        );

        assertEq(policy.pendingProposalId(), pendingId);

        // State changes → agent decides to withdraw
        vm.prank(agent);
        policy.withdraw(pendingId);

        assertEq(policy.pendingProposalId(), 0);

        // Agent can submit new proposal now
        _agentPropose(
            address(ledger),
            abi.encodeCall(VaultLedger.recordTrade, (VaultLedger.TradeAction.REBALANCE, "post-withdraw", 0, 3, false)),
            VaultPolicy.AssetCategory.BOND,
            "new proposal after withdraw"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 9: Attestation immutable ownership
    // ═══════════════════════════════════════════════════════════════════════════

    function test_09_attestationImmutableOwnership() public {
        // Only agent (deployer) owns the attestation contract
        assertEq(attestation.owner(), agent);

        // Cannot transfer ownership
        vm.prank(agent);
        vm.expectRevert("immutable ownership");
        attestation.transferOwnership(manager);

        // Cannot renounce ownership
        vm.prank(agent);
        vm.expectRevert("immutable ownership");
        attestation.renounceOwnership();

        // Non-owner cannot attest
        vm.prank(investor);
        vm.expectRevert();
        attestation.attest(Attestation.AttestationData({
            attester: investor, token: address(vaultShares), approved: true,
            reason: "hack", score: 99, timestamp: block.timestamp,
            decisionType: 0, decisionOrigin: 0, quorumVotes: 1, quorumTotal: 1,
            nav: 0, riskScore: 0, portfolioBreakdown: "", yieldHistory: ""
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 10: Market shock → delist from marketplace
    // ═══════════════════════════════════════════════════════════════════════════

    function test_10_marketShock_delistFromMarketplace() public {
        // Setup: certify, attest, mint, and list receipt tokens
        vm.prank(agent);
        receiptToken.updateBackingInfo(85, 25, "QmPicasso", 500_000e18);
        vm.prank(agent);
        attestation.attest(Attestation.AttestationData({
            attester: agent, token: address(receiptToken), approved: true,
            reason: "Certified", score: 85, timestamp: block.timestamp,
            decisionType: 1, decisionOrigin: 0, quorumVotes: 4, quorumTotal: 4,
            nav: 90_000_000, riskScore: 25,
            portfolioBreakdown: "{}", yieldHistory: "[]"
        }));
        vm.prank(agent);
        receiptToken.mint(agent, 5_000e18);

        vm.startPrank(agent);
        receiptToken.approve(address(marketplace), 5_000e18);
        uint256 listingId = marketplace.list(
            address(receiptToken), Marketplace.AssetType.ERC20, 0, 5_000e18, 250e18
        );
        vm.stopPrank();

        assertEq(marketplace.getActiveListings().length, 1);
        assertEq(receiptToken.balanceOf(address(marketplace)), 5_000e18);

        // MARKET SHOCK: Risk spike — agent decides to delist
        vm.prank(agent);
        marketplace.delist(listingId);

        // Tokens returned to agent, listing removed
        assertEq(marketplace.getActiveListings().length, 0);
        assertEq(receiptToken.balanceOf(agent), 5_000e18);

        // Agent attests the shock response
        vm.prank(agent);
        attestation.attest(Attestation.AttestationData({
            attester: agent, token: address(receiptToken), approved: false,
            reason: "MARKET SHOCK: Risk spike on underlying art asset. Delisted receipt token pending re-evaluation.",
            score: 30, timestamp: block.timestamp,
            decisionType: 2, decisionOrigin: 0, quorumVotes: 4, quorumTotal: 4,
            nav: 85_000_000, riskScore: 75,
            portfolioBreakdown: "{}", yieldHistory: "[]"
        }));

        assertEq(attestation.getAttestationCountForToken(address(receiptToken)), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 11: Selector allowlist enforcement
    // ═══════════════════════════════════════════════════════════════════════════

    function test_11_selectorAllowlist() public {
        // Agent cannot propose arbitrary function calls
        bytes memory badCall = abi.encodeWithSignature("transferOwnership(address)", agent);

        vm.prank(agent);
        vm.expectRevert("selector not allowed");
        policy.propose(address(ledger), badCall, VaultPolicy.AssetCategory.BOND, "hack attempt", 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTEGRATION TEST 12: Receipt token cannot mint without attestation
    // ═══════════════════════════════════════════════════════════════════════════

    function test_12_receiptGating() public {
        // Cannot mint without certification
        vm.prank(agent);
        vm.expectRevert("not certified");
        receiptToken.mint(investor, 100e18);

        // Certify but don't attest
        vm.prank(agent);
        receiptToken.updateBackingInfo(85, 25, "QmHash", 500_000e18);

        // Still cannot mint (no attestation)
        vm.prank(agent);
        vm.expectRevert("no attestation exists");
        receiptToken.mint(investor, 100e18);

        // Now attest
        vm.prank(agent);
        attestation.attest(Attestation.AttestationData({
            attester: agent, token: address(receiptToken), approved: true,
            reason: "Certified", score: 85, timestamp: block.timestamp,
            decisionType: 1, decisionOrigin: 0, quorumVotes: 4, quorumTotal: 4,
            nav: 0, riskScore: 0, portfolioBreakdown: "", yieldHistory: ""
        }));

        // NOW can mint
        vm.prank(agent);
        receiptToken.mint(investor, 100e18);
        assertEq(receiptToken.balanceOf(investor), 100e18);
    }

    // ─── Accept ETH ──────────────────────────────────────────────────────────
    receive() external payable {}
}

// ─── Mock DEX for swap tests ─────────────────────────────────────────────────

contract MockDEX {
    function swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut) external {
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).transfer(msg.sender, amountOut);
    }
}
