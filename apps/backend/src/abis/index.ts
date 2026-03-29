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

/**
 * VaultLedger ABI — must match the DEPLOYED contract, not the source.
 * Current deployment: old struct WITHOUT decimals field.
 * When SC dev redeploys with decimals, add `uint8 decimals` after `string symbol`.
 */
export const VAULT_LEDGER_ABI = [
  "function getNAV() view returns (uint256)",
  "function getVaultSnapshot() view returns (tuple(address tokenAddress, string symbol, uint256 balance, uint256 valueUSD, uint8 allocationPct, uint8 riskScore, uint256 yieldBps, bool active)[], tuple(address tokenAddress, uint256 tokenId, string symbol, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore, bool active)[])",
  "function getERC20Count() view returns (uint256)",
  "function getERC721Count() view returns (uint256)",
] as const;

/** DvPExchange.sol — Rayls-native atomic swap on Privacy Node (US-2A.4) */
export const DVP_EXCHANGE_ABI = [
  "function createExchange(address creator, (uint8 assetType, address tokenAddress, uint256 amount, uint256 tokenId) creatorAsset, address beneficiary, address counterparty, (uint8 assetType, address tokenAddress, uint256 amount, uint256 tokenId) counterpartyAsset, uint256 expiration) external returns (uint256 exchangeId)",
  "function executeExchange(uint256 exchangeId) external",
  "function cancelExchange(uint256 exchangeId) external",
  "function getExchange(uint256 exchangeId) view returns (tuple(address creator, tuple(uint8 assetType, address tokenAddress, uint256 amount, uint256 tokenId) creatorAsset, address creatorBeneficiary, address counterparty, tuple(uint8 assetType, address tokenAddress, uint256 amount, uint256 tokenId) counterpartyAsset, uint256 expirationDate, uint8 status))",
  "function nextExchangeId() view returns (uint256)",
  "event ExchangeCreated(uint256 indexed exchangeId, address indexed creator, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address counterparty, uint256 expirationDate)",
  "event ExchangeExecuted(uint256 indexed exchangeId, address indexed executor)",
  "event ExchangeCancelled(uint256 indexed exchangeId)",
] as const;

/** VaultPolicy.sol — governance gateway on Privacy Node */
export const VAULT_POLICY_ABI = [
  "function propose(address target, bytes callData, uint8 category, string reasoning, uint8 quorumVotes) external returns (uint256 id)",
  "function withdraw(uint256 proposalId) external",
  "function approve(uint256 proposalId) external",
  "function dismiss(uint256 proposalId) external",
  "function emergencyStop() external",
  "function resume() external",
  "function getPendingProposal() view returns (tuple(uint256 id, address target, bytes callData, uint8 category, uint256 valueUSD, string reasoning, uint8 quorumVotes, uint8 status, uint256 createdAt, uint256 resolvedAt, address resolvedBy))",
  "function getProposalHistory() view returns (tuple(uint256 id, address target, bytes callData, uint8 category, uint256 valueUSD, string reasoning, uint8 quorumVotes, uint8 status, uint256 createdAt, uint256 resolvedAt, address resolvedBy)[])",
  "function getSettings() view returns (tuple(uint256 valueThreshold, uint256 maxTxPerWindow, uint256 windowDuration, bool paused), bool[6])",
  "function pendingProposalId() view returns (uint256)",
  "event ProposalAutoExecuted(uint256 indexed id, uint8 category, uint8 quorumVotes, uint256 derivedValueUSD, address target)",
  "event ProposalPending(uint256 indexed id, uint8 category, uint8 quorumVotes, uint256 derivedValueUSD, string reasoning)",
  "event ProposalApproved(uint256 indexed id, address indexed by)",
  "event ProposalWithdrawn(uint256 indexed id)",
  "event ExecutionFailed(uint256 indexed id, bytes reason)",
] as const;
