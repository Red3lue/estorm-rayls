// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultPolicy} from "../src/VaultPolicy.sol";
import {VaultLedger} from "../src/VaultLedger.sol";

contract VaultPolicyTest is Test {
    VaultPolicy  policy;
    VaultLedger  ledger;

    address manager = makeAddr("manager");
    address agent   = makeAddr("agent");
    address alice   = makeAddr("alice");

    address constant TOKEN_A = address(0x1001);

    uint256 constant THRESHOLD = 5_000_000_00;
    uint256 constant MAX_TX    = 10;
    uint256 constant WINDOW    = 3600;

    function setUp() public {
        policy = new VaultPolicy(manager, agent, THRESHOLD, MAX_TX, WINDOW);
        ledger = new VaultLedger(address(policy)); // VaultPolicy is owner
    }

    function _addAssetCall(address token) internal pure returns (bytes memory) {
        return abi.encodeWithSignature(
            "addERC20Asset(address,string,uint256,uint256,uint8,uint256)",
            token, "BOND-GOV-6M", 350_000e18, 35_000_000_00, uint8(15), uint256(420)
        );
    }

    // ─── Auto-execution: executes call on target ──────────────────────────────

    function test_autoExec_executesCallOnTarget() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.BOND, 1000_00, "add bond", 3);
        assertEq(ledger.getERC20Count(), 1);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_autoExec_emitsEvent() public {
        vm.prank(agent);
        vm.expectEmit(true, false, false, false);
        emit VaultPolicy.ProposalAutoExecuted(1, VaultPolicy.AssetCategory.BOND, 3, 1000_00, address(ledger));
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.BOND, 1000_00, "add bond", 3);
    }

    // ─── Pending: call NOT executed until approved ────────────────────────────

    function test_pending_aboveThreshold_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.BOND, THRESHOLD + 1, "large", 3);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), id);
    }

    function test_pending_artCategory_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), id);
    }

    function test_pending_blocksSecondPending() public {
        vm.startPrank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "first", 4);
        vm.expectRevert("pending proposal exists: resolve it first");
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "second", 4);
        vm.stopPrank();
    }

    function test_autoExecWhilePendingExists() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "pending", 4);
        bytes memory readCall = abi.encodeWithSignature("getERC20Count()");
        vm.prank(agent);
        uint256 id2 = policy.propose(address(ledger), readCall, VaultPolicy.AssetCategory.NAV_UPDATE, 0, "nav", 4);
        assertGt(id2, 1);
        assertEq(policy.pendingProposalId(), 1);
    }

    // ─── Approve: executes stored call ───────────────────────────────────────

    function test_approve_executesCall() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
        assertEq(ledger.getERC20Count(), 0);

        vm.prank(manager);
        policy.approve(id);

        assertEq(ledger.getERC20Count(), 1);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_approve_emitsEvent() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
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
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
        vm.prank(manager);
        policy.approve(1);
        vm.prank(manager);
        vm.expectRevert("not pending");
        policy.approve(1);
    }

    // ─── Dismiss: discards call without executing ─────────────────────────────

    function test_dismiss_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
        vm.prank(manager);
        policy.dismiss(id);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), 0);
    }

    // ─── Withdraw ────────────────────────────────────────────────────────────

    function test_withdraw_doesNotExecute() public {
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
        vm.prank(agent);
        policy.withdraw(id);
        assertEq(ledger.getERC20Count(), 0);
        assertEq(policy.pendingProposalId(), 0);
    }

    function test_withdraw_onlyAgent() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
        vm.prank(manager);
        vm.expectRevert("not agent");
        policy.withdraw(1);
    }

    // ─── Execution failure propagates ────────────────────────────────────────

    function test_badCallReverts() public {
        vm.prank(agent);
        vm.expectRevert();
        policy.propose(address(ledger), abi.encodeWithSignature("nonExistentFn()"), VaultPolicy.AssetCategory.NAV_UPDATE, 0, "bad", 4);
    }

    // ─── Rate limit ──────────────────────────────────────────────────────────

    function test_rateLimitBlocks() public {
        bytes memory cd = abi.encodeWithSignature("getERC20Count()");
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "t", 3);
        }
        uint256 id = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "11th", 3);
        assertEq(policy.pendingProposalId(), id);
        vm.stopPrank();
    }


    // ─── Emergency stop ──────────────────────────────────────────────────────

    function test_emergencyStop_blocksPropose() public {
        vm.prank(manager);
        policy.emergencyStop();
        vm.prank(agent);
        vm.expectRevert("emergency stop active");
        policy.propose(address(ledger), "", VaultPolicy.AssetCategory.BOND, 0, "", 3);
    }

    function test_emergencyStop_blocksApprove() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "art", 4);
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

    // ─── Access control ──────────────────────────────────────────────────────

    function test_onlyAgent_propose() public {
        vm.prank(alice);
        vm.expectRevert("not agent");
        policy.propose(address(ledger), "", VaultPolicy.AssetCategory.BOND, 0, "", 0);
    }

    function test_onlyManager_approve() public { vm.prank(alice); vm.expectRevert("not manager"); policy.approve(1); }
    function test_onlyManager_dismiss() public  { vm.prank(alice); vm.expectRevert("not manager"); policy.dismiss(1); }
    function test_onlyAgent_withdraw() public   { vm.prank(alice); vm.expectRevert("not agent");   policy.withdraw(1); }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function test_getSettings() public view {
        (VaultPolicy.GovernanceSettings memory s, bool[6] memory perms) = policy.getSettings();
        assertEq(s.valueThreshold, THRESHOLD);
        assertEq(s.maxTxPerWindow, MAX_TX);
        assertTrue(perms[0]);  // BOND
        assertFalse(perms[3]); // ART
    }

    function test_getPendingProposal() public {
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "certify Picasso", 4);
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
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.BOND, 1000_00, "auto", 3);
        vm.prank(agent);
        policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART,  1000_00, "pending", 4);
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
        uint256 id = policy.propose(address(ledger), _addAssetCall(TOKEN_A), VaultPolicy.AssetCategory.ART, 1000_00, "certify", 4);
        assertEq(policy.pendingProposalId(), 0);
        assertGt(id, 0);
    }

    function test_getRateLimitStatus() public {
        bytes memory cd = abi.encodeWithSignature("getERC20Count()");
        vm.startPrank(agent);
        policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "t1", 3);
        policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "t2", 3);
        vm.stopPrank();
        (uint256 used, uint256 max,) = policy.getRateLimitStatus();
        assertEq(used, 2);
        assertEq(max, MAX_TX);
    }
    function test_rateLimitResetsAfterWindow() public {
        bytes memory cd = abi.encodeWithSignature("getERC20Count()");
        vm.startPrank(agent);
        for (uint256 i = 0; i < MAX_TX; i++) {
            policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "t", 3);
        }
        // 11th hits rate limit → pending
        uint256 pendingId = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "11th", 3);
        vm.stopPrank();
        vm.prank(manager);
        policy.dismiss(pendingId);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(agent);
        uint256 id = policy.propose(address(ledger), cd, VaultPolicy.AssetCategory.BOND, 1000_00, "new window", 3);
        assertEq(policy.pendingProposalId(), 0);
        assertGt(id, 0);
    }
}
