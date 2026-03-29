// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Attestation
/// @notice Public Chain (Chain ID 7295799) reference implementation.
///         See IAttestation for the minimal interface custom implementations must satisfy.
///
///         DEPLOYMENT MODEL:
///           The backend Express API deploys this contract using the AI agent's
///           wallet. The deployer (msg.sender) automatically becomes the immutable
///           owner — the only address that can ever call `attest()`.
///           Institutions replace this contract with their own schema; the backend
///           redeploys it. The trust anchor is always: deployer wallet = agent = owner.
///
///         IMMUTABLE OWNERSHIP:
///           `transferOwnership()` and `renounceOwnership()` are overridden to
///           revert. The attestation channel ownership is fixed at deployment and
///           is verifiable on-chain by anyone.
///
///         VISIBILITY:
///           All records are publicly readable at testnet-explorer.rayls.com.
contract Attestation is Ownable {

    // ─── Schema ───────────────────────────────────────────────────────────────

    /// @notice Reference demo schema. Institutions may replace this struct.
    struct AttestationData {
        address attester;           // agent wallet that submitted (= owner)
        address token;              // ERC-20 or ERC-721 token this attests to
        bool    approved;           // whether the governance decision was approved
        string  reason;             // human-readable reasoning from the AI
        uint256 score;              // 0-100 confidence score
        uint256 timestamp;          // block.timestamp at write time
        uint8   decisionType;       // 0=REBALANCE, 1=CERTIFICATION, 2=ISSUANCE
        uint8   decisionOrigin;     // 0=AI_QUORUM, 1=HUMAN_APPROVED, 2=HUMAN_INITIATED
        uint8   quorumVotes;        // agents that agreed (e.g. 3)
        uint8   quorumTotal;        // total agents in quorum (e.g. 4)
        uint256 nav;                // vault NAV in USD cents at attestation time
        uint256 riskScore;          // portfolio risk score 0-100
        string  portfolioBreakdown; // JSON: asset-by-asset allocation + risk
        string  yieldHistory;       // JSON: historical yield per period
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(address => AttestationData[]) private _attestations;
    uint256 public attestationCount;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AttestationRecorded(
        address indexed token,
        address indexed attester,
        bool    approved,
        uint8   decisionType,
        uint8   decisionOrigin,
        uint8   quorumVotes,
        uint256 nav,
        uint256 timestamp
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice msg.sender (the deployer — the AI agent wallet via the Express API)
    ///         becomes the immutable owner. No argument needed.
    constructor() Ownable(msg.sender) {}

    // ─── Immutable ownership ──────────────────────────────────────────────────

    function transferOwnership(address) public pure override {
        revert("immutable ownership");
    }

    function renounceOwnership() public pure override {
        revert("immutable ownership");
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Record a full governance attestation (demo schema).
    ///         Only the owner (AI agent wallet) can call this.
    function attest(AttestationData calldata data) external onlyOwner {
        require(data.token     != address(0), "zero token");
        require(data.attester  != address(0), "zero attester");
        require(data.score     <= 100,        "score out of range");
        require(data.riskScore <= 100,        "riskScore out of range");

        _attestations[data.token].push(data);
        attestationCount++;

        emit AttestationRecorded(
            data.token,
            data.attester,
            data.approved,
            data.decisionType,
            data.decisionOrigin,
            data.quorumVotes,
            data.nav,
            data.timestamp
        );
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getAttestations(address token) external view returns (AttestationData[] memory) {
        return _attestations[token];
    }

    function getLatestAttestation(address token) external view returns (AttestationData memory) {
        AttestationData[] storage list = _attestations[token];
        require(list.length > 0, "no attestations");
        return list[list.length - 1];
    }

    function getAttestationCount() external view returns (uint256) {
        return attestationCount;
    }

    function getAttestationCountForToken(address token) external view returns (uint256) {
        return _attestations[token].length;
    }
}
