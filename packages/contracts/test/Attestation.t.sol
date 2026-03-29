// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Attestation} from "../src/Attestation.sol";

/// @notice The test contract IS the deployer, therefore it IS the owner/agent.
///         No constructor argument — matches the production deploy model where
///         the Express API deploys with the agent wallet.
contract AttestationTest is Test {

    Attestation att;

    // In tests, address(this) is the owner (deployer = agent wallet).
    address alice = makeAddr("alice");

    address constant TOKEN_A = address(0xA001);
    address constant TOKEN_B = address(0xA002);

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _data(address token, bool approved) internal view returns (Attestation.AttestationData memory) {
        return Attestation.AttestationData({
            attester:           address(this),
            token:              token,
            approved:           approved,
            reason:             "AI quorum decision",
            score:              85,
            timestamp:          block.timestamp,
            decisionType:       0,
            decisionOrigin:     0,
            quorumVotes:        3,
            quorumTotal:        4,
            nav:                200_000_000,
            riskScore:          40,
            portfolioBreakdown: '{"BOND":50,"RECV":25,"STABLE":25}',
            yieldHistory:       '{"2024-Q4":420,"2025-Q1":430}'
        });
    }

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        att = new Attestation(); // deployer = address(this) = owner
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_deployerIsOwner() public view {
        assertEq(att.owner(), address(this));
    }

    // ─── Immutable ownership ──────────────────────────────────────────────────

    function test_transferOwnership_alwaysReverts() public {
        vm.expectRevert("immutable ownership");
        att.transferOwnership(alice);
    }

    function test_transferOwnership_nonOwnerAlsoReverts() public {
        vm.prank(alice);
        vm.expectRevert("immutable ownership");
        att.transferOwnership(alice);
    }

    function test_renounceOwnership_alwaysReverts() public {
        vm.expectRevert("immutable ownership");
        att.renounceOwnership();
    }

    function test_owner_unchangedAfterAttemptedTransfer() public view {
        // transferOwnership always reverts, so owner can never change
        assertEq(att.owner(), address(this));
    }

    // ─── attest — happy path ──────────────────────────────────────────────────

    function test_attest_storesRecord() public {
        att.attest(_data(TOKEN_A, true));

        Attestation.AttestationData[] memory list = att.getAttestations(TOKEN_A);
        assertEq(list.length, 1);
        assertEq(list[0].token,       TOKEN_A);
        assertTrue(list[0].approved);
        assertEq(list[0].score,       85);
        assertEq(list[0].nav,         200_000_000);
        assertEq(list[0].riskScore,   40);
        assertEq(list[0].quorumVotes, 3);
        assertEq(list[0].quorumTotal, 4);
    }

    function test_attest_incrementsCount() public {
        att.attest(_data(TOKEN_A, true));
        assertEq(att.attestationCount(), 1);

        att.attest(_data(TOKEN_B, false));
        assertEq(att.attestationCount(), 2);
    }

    function test_attest_multipleForSameToken() public {
        att.attest(_data(TOKEN_A, true));
        att.attest(_data(TOKEN_A, false));

        Attestation.AttestationData[] memory list = att.getAttestations(TOKEN_A);
        assertEq(list.length, 2);
        assertTrue(list[0].approved);
        assertFalse(list[1].approved);
    }

    function test_attest_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit Attestation.AttestationRecorded(
            TOKEN_A, address(this), true, 0, 0, 3, 200_000_000, block.timestamp
        );
        att.attest(_data(TOKEN_A, true));
    }

    // ─── attest — access control ──────────────────────────────────────────────

    function test_attest_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert();
        att.attest(_data(TOKEN_A, true));
    }

    // ─── attest — validation ─────────────────────────────────────────────────

    function test_attest_zeroToken_reverts() public {
        Attestation.AttestationData memory d = _data(TOKEN_A, true);
        d.token = address(0);
        vm.expectRevert("zero token");
        att.attest(d);
    }

    function test_attest_zeroAttester_reverts() public {
        Attestation.AttestationData memory d = _data(TOKEN_A, true);
        d.attester = address(0);
        vm.expectRevert("zero attester");
        att.attest(d);
    }

    function test_attest_scoreOutOfRange_reverts() public {
        Attestation.AttestationData memory d = _data(TOKEN_A, true);
        d.score = 101;
        vm.expectRevert("score out of range");
        att.attest(d);
    }

    function test_attest_riskScoreOutOfRange_reverts() public {
        Attestation.AttestationData memory d = _data(TOKEN_A, true);
        d.riskScore = 101;
        vm.expectRevert("riskScore out of range");
        att.attest(d);
    }

    // ─── getLatestAttestation ─────────────────────────────────────────────────

    function test_getLatestAttestation_returnsLast() public {
        att.attest(_data(TOKEN_A, true));

        Attestation.AttestationData memory d2 = _data(TOKEN_A, false);
        d2.score = 42;
        att.attest(d2);

        assertEq(att.getLatestAttestation(TOKEN_A).score, 42);
        assertFalse(att.getLatestAttestation(TOKEN_A).approved);
    }

    function test_getLatestAttestation_noRecords_reverts() public {
        vm.expectRevert("no attestations");
        att.getLatestAttestation(TOKEN_A);
    }

    // ─── counts ───────────────────────────────────────────────────────────────

    function test_getAttestationCount_global() public {
        assertEq(att.getAttestationCount(), 0);
        att.attest(_data(TOKEN_A, true));
        att.attest(_data(TOKEN_B, false));
        assertEq(att.getAttestationCount(), 2);
    }

    function test_getAttestationCountForToken() public {
        att.attest(_data(TOKEN_A, true));
        att.attest(_data(TOKEN_A, false));
        att.attest(_data(TOKEN_B, true));
        assertEq(att.getAttestationCountForToken(TOKEN_A), 2);
        assertEq(att.getAttestationCountForToken(TOKEN_B), 1);
    }

    function test_getAttestations_emptyToken() public view {
        assertEq(att.getAttestations(TOKEN_A).length, 0);
    }
}
