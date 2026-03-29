// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAttestation
/// @notice Base interface for institution-customizable attestation contracts.
///
///         DESIGN INTENT:
///           Each institution provides its own Attestation.sol implementation
///           (choosing which fields to disclose). The backend deploys that
///           implementation with the protocol's attestation writer as immutable
///           owner. Only the interface below needs to stay stable for the
///           indexer and the attestation module to work.
///
///         OWNERSHIP RULE:
///           Implementations MUST override `transferOwnership()` to revert.
///           Ownership is set once at deployment and cannot be changed.
///           Only the owner (the protocol's attestation writer agent) can call
///           `attest()`.
interface IAttestation {
    /// @notice Record a governance attestation.
    ///         Implementations may accept any struct; this is the minimum
    ///         callable surface the attestation module depends on.
    /// @param token   The on-chain asset address this attestation refers to.
    /// @param approved Whether the governance decision was approved.
    /// @param reason  Human-readable reasoning from the AI or manager.
    /// @param score   Confidence score 0-100.
    function attest(
        address token,
        bool    approved,
        string  calldata reason,
        uint256 score
    ) external;

    /// @notice Returns the total number of attestations across all tokens.
    function getAttestationCount() external view returns (uint256);

    /// @notice Returns the number of attestations for a specific token.
    function getAttestationCountForToken(address token) external view returns (uint256);
}
