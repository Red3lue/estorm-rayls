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

/** VaultLedger ABI — matches the new deployment with oracle + decimals field. */
export const VAULT_LEDGER_ABI = [
  "function getNAV() view returns (uint256)",
  "function getVaultSnapshot() view returns (tuple(address tokenAddress, string symbol, uint8 decimals, uint256 balance, uint256 valueUSD, uint8 allocationPct, uint8 riskScore, uint256 yieldBps, bool active)[], tuple(address tokenAddress, uint256 tokenId, string symbol, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore, bool active)[])",
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

/** VaultShareToken.sol — ERC-20 vault share token on Public Chain (US-2B.2) */
export const VAULT_SHARE_TOKEN_ABI = [
  "function buy() external payable",
  "function updateNAV(uint256 newNAV) external",
  "function getSharePrice() view returns (uint256)",
  "function getNAV() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event NAVUpdated(uint256 oldNAV, uint256 newNAV, uint256 sharePrice, uint256 timestamp)",
  "event SharesPurchased(address indexed buyer, uint256 usdrPaid, uint256 sharesMinted, uint256 pricePerShare)",
] as const;

/** ReceiptToken.sol — ERC-20 fractionalized receipt on Public Chain (US-2B.3) */
export const RECEIPT_TOKEN_ABI = [
  "function mint(address to, uint256 amount) external",
  "function updateBackingInfo(uint256 certScore, uint256 riskScore, string provenanceHash, uint256 valuationUSD) external",
  "function getBackingInfo() view returns (tuple(string assetType, string assetLabel, uint256 valuationUSD, uint256 certScore, uint256 riskScore, string provenanceHash, uint256 certifiedAt, bool certified))",
  "function getReceiptPrice() view returns (uint256)",
  "function getAttestation() view returns (tuple(address attester, address token, bool approved, string reason, uint256 score, uint256 timestamp, uint8 decisionType, uint8 decisionOrigin, uint8 quorumVotes, uint8 quorumTotal, uint256 nav, uint256 riskScore, string portfolioBreakdown, string yieldHistory))",
  "function supplyCap() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function attestationContract() view returns (address)",
  "event ReceiptsMinted(address indexed to, uint256 amount, uint256 totalSupply)",
  "event BackingInfoUpdated(string assetType, uint256 valuationUSD, uint256 certScore, uint256 riskScore)",
] as const;

/** Marketplace.sol — public listing for vault shares + receipt tokens (US-2B.4) */
export const MARKETPLACE_ABI = [
  "function list(address token, uint8 assetType, uint256 tokenId, uint256 amount, uint256 price) external returns (uint256 listingId)",
  "function buy(uint256 listingId) external payable",
  "function delist(uint256 listingId) external",
  "function update(uint256 listingId, uint256 newPrice) external",
  "function getListing(uint256 listingId) view returns (tuple(address token, uint8 assetType, uint256 tokenId, uint256 amount, uint256 price, bool active, address seller))",
  "function getActiveListings() view returns (uint256[])",
  "function getListingCount() view returns (uint256)",
  "event Listed(uint256 indexed listingId, address indexed token, uint8 assetType, uint256 amount, uint256 price)",
  "event Bought(uint256 indexed listingId, address indexed buyer, uint256 price)",
  "event Delisted(uint256 indexed listingId)",
] as const;

/** PublicChainERC20 mirror — auto-deployed by relayer on Public Chain after token approval.
 *  Used for Public → Privacy teleport (US-2B.5). */
export const PUBLIC_CHAIN_MIRROR_ABI = [
  "function teleportToPrivacyNode() external",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
] as const;

/** RaylsErc20Handler — Privacy Node token with teleport capabilities */
export const RAYLS_ERC20_HANDLER_ABI = [
  "function teleportToPublicChain(address to, uint256 value, uint256 chainId) external returns (bool)",
  "function getLockedAmount() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
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
