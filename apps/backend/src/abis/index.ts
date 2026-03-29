export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
] as const;

export const ERC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function balanceOf(address) view returns (uint256)",
] as const;

/** Attestation.sol on Public Chain (US-2B.1) — struct-based, deployer = immutable owner = agent */
export const ATTESTATION_ABI = [
  "function attest((address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory) data) external",
  "function getAttestations(address token) view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory)[])",
  "function getLatestAttestation(address token) view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory))",
  "function getAttestationCount() view returns (uint256)",
  "function getAttestationCountForToken(address token) view returns (uint256)",
  "function owner() view returns (address)",
  "event AttestationRecorded(address indexed token, address indexed attester, bool approved, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint256 nav, uint256 timestamp)",
] as const;

/** Matches VaultLedger.sol deployed on feat/2A.3 */
export const VAULT_LEDGER_ABI = [
  "function getNAV() view returns (uint256)",
  "function getVaultSnapshot() view returns (tuple(address tokenAddress, string symbol, uint256 balance, uint256 valueUSD, uint8 allocationPct, uint8 riskScore, uint256 yieldBps, bool active)[], tuple(address tokenAddress, uint256 tokenId, string symbol, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore, bool active)[])",
  "function getERC20Count() view returns (uint256)",
  "function getERC721Count() view returns (uint256)",
] as const;
