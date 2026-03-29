export type AssetType = "erc20" | "erc721";

export interface OpportunityEvent {
  type: AssetType;
  tokenAddress: string;
  symbol: string;
  /** ERC-20: risk score 0-100 */
  riskScore: number;
  /** ERC-20 only: yield in basis points (100 = 1%) */
  yieldBps?: number;
  /** ERC-721 only: token ID */
  tokenId?: number;
  /** ERC-721 only: valuation in cents */
  valuationUSD?: number;
  reason: string;
}

export interface OpportunityResult {
  type: AssetType;
  symbol: string;
  tokenAddress: string;
  txHash: string;
  registeredAt: number;
}
