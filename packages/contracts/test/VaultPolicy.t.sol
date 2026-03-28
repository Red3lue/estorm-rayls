// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultPolicy} from "../src/VaultPolicy.sol";

contract VaultPolicyTest is Test {
    VaultPolicy policy;

    address manager = makeAddr("manager");
    address agent   = makeAddr("agent");
    address alice   = makeAddr("alice");

    // Default settings: $50K threshold, 10 tx/hour, art = human-only
    uint256 constant THRESHOLD      = 5_000_000_00;  // $50,000 in cents
    uint256 constant MAX_TX         = 10;
    uint256 constant WINDOW         = 3600;           // 1 hour

    function setUp() public {
        policy = new VaultPolicy(manager, agent, THRESHOLD, MAX_TX, WINDOW);
    }

    // ─── Access control ──────────────────────────────────────────────────────

    function test_onlyAgent_propose() public {
        vm.prank(alice);
        vm.expectRevert("not agent");
        policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "test", 3);
    }

    function test_onlyManager_approve() public {
        vm.prank(alice);
        vm.expectRevert("not manager");
        policy.approve(1);
    }

    function test_onlyManager_dismiss() public {
        vm.prank(alice);
        vm.expectRevert("not manager");
        policy.dismiss(1);
    }

    function test_onlyAgent_withdraw() public {
        vm.prank(alice);
        vm.expectRevert("not agent");
        policy.withdraw(1);
    }

    function test_onlyManager_setValueThreshold() public {
        vm.prank(alice);
        vm.expectRevert("not manager");
        policy.setValueThreshold(1000);
    }

    function test_onlyManager_emergencyStop() public {
        vm.prank(alice);
        vm.expectRevert("not manager");
        policy.emergencyStop();
    }

    // ─── Auto-execution ───────────────────────────────────────────────────────

    function test_propose_autoExecute_belowThreshold() public {
        vm.prank(agent);
        vm.expectEmit(true, false, false, true);
        emit VaultPolicy.ProposalAutoExecuted(1, VaultPolicy.AssetCategory.BOND, 3, 1000_00);
        uint256 id = policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "small rebalance", 3);
        assertEq(id, 1);
        assertEq(policy.pendingProposalId(), 0); // nothing pending
    }

    function test_propose_autoExecute_navUpdate() public {
        vm.prank(agent);
        uint256 id = policy.propose(VaultPolicy.AssetCategory.NAV_UPDATE, 0, "NAV update", 4);
        assertEq(id, 1);
        assertEq(policy.pendingProposalId(), 0);
    }

    // ─── Pending (blocked) proposals ─────────────────────────────────────────

    function test_propose_pending_aboveThreshold() public {
        vm.prank(agent);
        vm.expectEmit(true, false, false, false);
        emit VaultPolicy.ProposalPending(1, VaultPolicy.AssetCategory.BOND, 3, 0, "");
        uint256 id = policy.propose(VaultPolicy.AssetCategory.BOND, THRESHOLD + 1, "large swap", 3);
        assertEq(id, 1);
        assertEq(policy.pendingProposalId(), 1);
    }

    function test_propose_pending_artCategory() public {
        vm.prank(agent);
        uint256 id = policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify Picasso", 4);
        assertEq(id, 1);
        assertEq(policy.pendingProposalId(), 1);
    }

    function test_propose_pending_blocksSecondPending() public {
        vm.startPrank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "first", 4);
        vm.expectRevert("pending proposal exists: resolve it first");
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "second", 4);
        vm.stopPrank();
    }

    function test_propose_autoExecWhilePendingExists() public {
        // First proposal goes PENDING (art)
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        assertEq(policy.pendingProposalId(), 1);

        // Auto-exec can still proceed while a proposal is pending
        vm.prank(agent);
        uint256 id2 = policy.propose(VaultPolicy.AssetCategory.NAV_UPDATE, 0, "nav update", 4);
        assertEq(id2, 2);
        assertEq(policy.pendingProposalId(), 1); // original still pending
    }

    // ─── Approve ─────────────────────────────────────────────────────────────

    function test_approve() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify Picasso", 4);

        vm.prank(manager);
        vm.expectEmit(true, true, false, false);
        emit VaultPolicy.ProposalApproved(1, manager);
        policy.approve(1);

        assertEq(policy.pendingProposalId(), 0);
    }

    function test_approve_revertsOnNonPending() public {
        vm.prank(manager);
        vm.expectRevert("invalid id");
        policy.approve(99);
    }

    function test_approve_revertsIfAlreadyApproved() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        vm.prank(manager);
        policy.approve(1);
        vm.prank(manager);
        vm.expectRevert("not pending");
        policy.approve(1);
    }

    // ─── Dismiss ─────────────────────────────────────────────────────────────

    function test_dismiss() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);

        vm.prank(manager);
        vm.expectEmit(true, true, false, false);
        emit VaultPolicy.ProposalDismissed(1, manager);
        policy.dismiss(1);

        assertEq(policy.pendingProposalId(), 0);
    }

    // ─── Withdraw ────────────────────────────────────────────────────────────

    function test_withdraw() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);

        vm.prank(agent);
        vm.expectEmit(true, false, false, false);
        emit VaultPolicy.ProposalWithdrawn(1);
        policy.withdraw(1);

        assertEq(policy.pendingProposalId(), 0);
    }

    function test_withdraw_onlyAgent() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        vm.prank(manager);
        vm.expectRevert("not agent");
        policy.withdraw(1);
    }

    // ─── Rate limit ──────────────────────────────────────────────────────────

    function test_rateLimitBlocks() public {
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "trade", 3);
        }
        // 11th propose should be blocked → goes PENDING (rate limit exceeded)
        uint256 id = policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "trade 11", 3);
        assertEq(policy.pendingProposalId(), id);
        vm.stopPrank();
    }

    function test_rateLimitResetsAfterWindow() public {
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "trade", 3);
        }
        vm.stopPrank();

        // Advance time past window
        vm.warp(block.timestamp + WINDOW + 1);

        vm.prank(agent);
        uint256 id = policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "new window", 3);
        assertEq(policy.pendingProposalId(), 0); // auto-executed again
        assertGt(id, 0);
    }

    // ─── Emergency stop ──────────────────────────────────────────────────────

    function test_emergencyStop_blocksPropose() public {
        vm.prank(manager);
        policy.emergencyStop();

        vm.prank(agent);
        vm.expectRevert("emergency stop active");
        policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "trade", 3);
    }

    function test_emergencyStop_blocksApprove() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
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

    // ─── Read functions ───────────────────────────────────────────────────────

    function test_getSettings() public view {
        (VaultPolicy.GovernanceSettings memory s, bool[6] memory perms) = policy.getSettings();
        assertEq(s.valueThreshold, THRESHOLD);
        assertEq(s.maxTxPerWindow, MAX_TX);
        assertEq(s.windowDuration, WINDOW);
        assertFalse(s.paused);
        assertTrue(perms[0]);  // BOND = AI-managed
        assertFalse(perms[3]); // ART  = human-only
    }

    function test_getPendingProposal() public {
        vm.prank(agent);
        policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify Picasso", 4);
        VaultPolicy.Proposal memory p = policy.getPendingProposal();
        assertEq(p.id,           1);
        assertEq(p.quorumVotes,  4);
        assertEq(p.valueUSD,     1000_00);
        assertEq(p.reasoning,    "certify Picasso");
    }

    function test_getPendingProposal_revertsIfNone() public {
        vm.expectRevert("no pending proposal");
        policy.getPendingProposal();
    }

    function test_getProposalHistory() public {
        vm.startPrank(agent);
        policy.propose(VaultPolicy.AssetCategory.BOND,       1000_00,         "rebalance", 3);
        policy.propose(VaultPolicy.AssetCategory.NAV_UPDATE, 0,               "nav",       4);
        policy.propose(VaultPolicy.AssetCategory.ART,        1000_00,         "certify",   4);
        vm.stopPrank();

        VaultPolicy.Proposal[] memory history = policy.getProposalHistory();
        assertEq(history.length, 3);
        assertEq(uint8(history[0].status), uint8(VaultPolicy.ProposalStatus.AUTO_EXECUTED));
        assertEq(uint8(history[1].status), uint8(VaultPolicy.ProposalStatus.AUTO_EXECUTED));
        assertEq(uint8(history[2].status), uint8(VaultPolicy.ProposalStatus.PENDING));
    }

    function test_getRateLimitStatus() public {
        vm.startPrank(agent);
        policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "t1", 3);
        policy.propose(VaultPolicy.AssetCategory.BOND, 1000_00, "t2", 3);
        vm.stopPrank();

        (uint256 used, uint256 max,) = policy.getRateLimitStatus();
        assertEq(used, 2);
        assertEq(max, MAX_TX);
    }

    // ─── Settings setters ─────────────────────────────────────────────────────

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

        // Now art can auto-execute
        vm.prank(agent);
        uint256 id = policy.propose(VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        assertEq(policy.pendingProposalId(), 0);
        assertGt(id, 0);
    }

    function test_transferManager() public {
        vm.prank(manager);
        policy.transferManager(alice);
        assertEq(policy.manager(), alice);
    }

    function test_setAgent() public {
        vm.prank(manager);
        policy.setAgent(alice);
        assertEq(policy.agent(), alice);
    }
}
