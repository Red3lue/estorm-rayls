import { ethers } from "ethers";
import {
  CertificationStatus,
  type FungibleAsset,
  type NonFungibleAsset,
  type VaultSnapshot,
} from "../../types/vault.js";

export interface RawErc20Read {
  address: string;
  symbol: string;
  name: string;
  balance: bigint;
  decimals: number;
}

export interface RawErc721Read {
  address: string;
  symbol: string;
  name: string;
  tokenId: bigint;
  owned: boolean;
}

export interface Erc20Meta {
  allocationPct: number;
  riskScore: number;
  yieldRate: number;
  /** VaultLedger-tracked balance (raw units). Overrides balanceOf(agent) when present. */
  balance?: bigint;
  /** VaultLedger-tracked value in cents. */
  valueUSD?: number;
}

export interface Erc721Meta {
  valuation: number;
  certificationStatus: CertificationStatus;
  riskScore: number;
}

export const DEFAULT_ERC20_META: Record<string, Erc20Meta> = {
  "BOND-GOV-6M": { allocationPct: 30, riskScore: 15, yieldRate: 4.2 },
  "RECV-ACME-90D": { allocationPct: 25, riskScore: 45, yieldRate: 11.0 },
  "RECV-BETA-30D": { allocationPct: 20, riskScore: 35, yieldRate: 8.0 },
  "STABLE-USDr": { allocationPct: 25, riskScore: 0, yieldRate: 0.0 },
};

export const DEFAULT_ERC721_META: Record<string, Erc721Meta> = {
  "ART-PICASSO-01": { valuation: 500_000, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 30 },
  "ART-WARHOL-01": { valuation: 150_000, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 40 },
};

export function buildFungibleAsset(token: RawErc20Read, ledgerMeta: Erc20Meta | undefined): FungibleAsset {
  const meta = ledgerMeta ?? DEFAULT_ERC20_META[token.symbol] ?? { allocationPct: 0, riskScore: 50, yieldRate: 0 };
  // Prefer VaultLedger balance (tokens are held by VaultLedger, not agent wallet)
  const balance = meta.balance ?? token.balance;
  const value = meta.valueUSD != null ? meta.valueUSD / 100 : Number(ethers.formatUnits(balance, token.decimals));
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    balance,
    decimals: token.decimals,
    allocationPct: meta.allocationPct,
    yieldRate: meta.yieldRate,
    riskScore: meta.riskScore,
    value,
  };
}

export function buildNonFungibleAsset(token: RawErc721Read, ledgerMeta: Erc721Meta | undefined): NonFungibleAsset {
  const meta = ledgerMeta ?? DEFAULT_ERC721_META[token.symbol] ?? { valuation: 0, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 50 };
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    tokenId: token.tokenId,
    valuation: meta.valuation,
    certificationStatus: meta.certificationStatus,
    riskScore: meta.riskScore,
    receiptTokenIssued: false,
  };
}

export function computeNav(fungibles: FungibleAsset[]): number {
  return fungibles.reduce((sum, a) => sum + a.value, 0);
}

export function computePortfolioMetrics(fungibles: FungibleAsset[], nav: number) {
  if (nav === 0) return { portfolioRiskScore: 0, portfolioYield: 0, liquidityRatio: 0 };

  let weightedRisk = 0, weightedYield = 0, stablecoinValue = 0;
  for (const a of fungibles) {
    const w = a.value / nav;
    weightedRisk += a.riskScore * w;
    weightedYield += a.yieldRate * w;
    if (a.symbol === "STABLE-USDr") stablecoinValue = a.value;
  }
  return {
    portfolioRiskScore: Math.round(weightedRisk * 100) / 100,
    portfolioYield: Math.round(weightedYield * 100) / 100,
    liquidityRatio: Math.round((stablecoinValue / nav) * 10000) / 10000,
  };
}

export function mapCertificationStatus(status: number): CertificationStatus {
  return ({ 0: CertificationStatus.UNCERTIFIED, 1: CertificationStatus.CERTIFIED, 2: CertificationStatus.REJECTED } as Record<number, CertificationStatus>)[status] ?? CertificationStatus.UNCERTIFIED;
}

export function buildSnapshot(fungibles: FungibleAsset[], nonFungibles: NonFungibleAsset[]): VaultSnapshot {
  const nav = computeNav(fungibles);
  const nftValue = nonFungibles.reduce((s, n) => s + n.valuation, 0);
  const metrics = computePortfolioMetrics(fungibles, nav);
  return { timestamp: Math.floor(Date.now() / 1000), nav, totalValue: nav + nftValue, fungibles, nonFungibles, ...metrics };
}
