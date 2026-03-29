export interface FungibleAsset {
  address: string;
  symbol: string;
  balance: number;
  valueUSD: number;
  allocationPct: number;
  riskScore: number;
  yieldBps: number;
  active: boolean;
}

export interface NonFungibleAsset {
  address: string;
  tokenId: number;
  symbol: string;
  valuationUSD: number;
  certified: boolean;
  certScore: number;
  riskScore: number;
  active: boolean;
}

export interface VaultSnapshot {
  nav: number;
  fungibles: FungibleAsset[];
  nonFungibles: NonFungibleAsset[];
  timestamp: number;
}

export type CertificationStatus = "Certified" | "Pending" | "Rejected";
