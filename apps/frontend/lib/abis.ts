export const VAULT_LEDGER_ABI = [
  "function getNAV() view returns (uint256)",
  "function getVaultSnapshot() view returns (tuple(address tokenAddress, string symbol, uint256 balance, uint256 valueUSD, uint8 allocationPct, uint8 riskScore, uint256 yieldBps, bool active)[], tuple(address tokenAddress, uint256 tokenId, string symbol, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore, bool active)[])",
  "function getERC20Count() view returns (uint256)",
  "function getERC721Count() view returns (uint256)",
] as const;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
] as const;

export const ERC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
] as const;

export const ATTESTATION_ABI = [
  "function getAttestations(address token) view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory)[])",
  "function getLatestAttestation(address token) view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory))",
  "function getAttestationCount() view returns (uint256)",
  "event AttestationRecorded(address indexed token, address indexed attester, bool approved, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint256 nav, uint256 timestamp)",
] as const;

export const VAULT_SHARE_TOKEN_ABI = [
  "function getSharePrice() view returns (uint256)",
  "function getNAV() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
] as const;

export const RECEIPT_TOKEN_ABI = [
  "function getBackingInfo() view returns (tuple(string assetType, string assetLabel, uint256 valuationUSD, uint256 certScore, uint256 riskScore, string provenanceHash, uint256 certifiedAt, bool certified))",
  "function getReceiptPrice() view returns (uint256)",
  "function getAttestation() view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory))",
  "function supplyCap() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
] as const;

export const VAULT_POLICY_ABI = [
  "function approve(uint256 proposalId) external",
  "function dismiss(uint256 proposalId) external",
  "function emergencyStop() external",
  "function resume() external",
  "function getPendingProposal() view returns (tuple(uint256 id, address target, bytes callData, uint8 category, uint256 valueUSD, string reasoning, uint8 quorumVotes, uint8 status, uint256 createdAt, uint256 resolvedAt, address resolvedBy))",
  "function getProposalHistory() view returns (tuple(uint256 id, address target, bytes callData, uint8 category, uint256 valueUSD, string reasoning, uint8 quorumVotes, uint8 status, uint256 createdAt, uint256 resolvedAt, address resolvedBy)[])",
  "function getSettings() view returns (tuple(uint256 valueThreshold, uint256 maxTxPerWindow, uint256 windowDuration, bool paused), bool[6])",
  "function pendingProposalId() view returns (uint256)",
] as const;
