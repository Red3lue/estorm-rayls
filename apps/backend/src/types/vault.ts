export interface FungibleAsset {
  address: string;
  symbol: string;
  name: string;
  balance: bigint;
  decimals: number;
  allocationPct: number;
  yieldRate: number;
  riskScore: number;
  value: number;
}

export interface NonFungibleAsset {
  address: string;
  symbol: string;
  name: string;
  tokenId: bigint;
  valuation: number;
  certificationStatus: CertificationStatus;
  riskScore: number;
  receiptTokenIssued: boolean;
}

export enum CertificationStatus {
  UNCERTIFIED = "UNCERTIFIED",
  CERTIFIED = "CERTIFIED",
  REJECTED = "REJECTED",
}

export interface VaultSnapshot {
  timestamp: number;
  nav: number;
  totalValue: number;
  fungibles: FungibleAsset[];
  nonFungibles: NonFungibleAsset[];
  portfolioRiskScore: number;
  portfolioYield: number;
  liquidityRatio: number;
}
