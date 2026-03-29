import { ethers } from "ethers";
import { PRIVACY_NODE_RPC, PUBLIC_CHAIN_RPC, CONTRACTS } from "./config";
import { VAULT_LEDGER_ABI, VAULT_SHARE_TOKEN_ABI, RECEIPT_TOKEN_ABI, ATTESTATION_ABI } from "./abis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvestorMetrics {
  nav: number;
  riskScore: number;
  portfolioYield: number;
  sharePrice: number | null;
  totalShares: number | null;
  sharesAvailable: boolean;
}

export interface ReceiptTokenInfo {
  name: string;
  symbol: string;
  assetType: string;
  assetLabel: string;
  valuationUSD: number;
  certScore: number;
  riskScore: number;
  certified: boolean;
  certifiedAt: number;
  receiptPrice: number;
  totalSupply: number;
  supplyCap: number;
}

export interface InvestorAttestation {
  timestamp: number;
  decisionType: number;
  decisionOrigin: number;
  approved: boolean;
  quorumVotes: number;
  quorumTotal: number;
  nav: number;
  riskScore: number;
  portfolioBreakdown: string;
  yieldHistory: string;
}

export interface InvestorData {
  metrics: InvestorMetrics;
  receiptTokens: ReceiptTokenInfo[];
  attestations: InvestorAttestation[];
  timestamp: number;
}

// ── Providers ────────────────────────────────────────────────────────────────

let privacyProvider: ethers.JsonRpcProvider | null = null;
let publicProvider: ethers.JsonRpcProvider | null = null;

function getPrivacyProvider(): ethers.JsonRpcProvider {
  if (!privacyProvider) {
    privacyProvider = new ethers.JsonRpcProvider(PRIVACY_NODE_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return privacyProvider;
}

function getPublicProvider(): ethers.JsonRpcProvider {
  if (!publicProvider) {
    publicProvider = new ethers.JsonRpcProvider(PUBLIC_CHAIN_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return publicProvider;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchAggregatedMetrics(): Promise<{
  nav: number;
  riskScore: number;
  portfolioYield: number;
}> {
  const provider = getPrivacyProvider();
  const ledger = new ethers.Contract(
    CONTRACTS.vaultLedger,
    VAULT_LEDGER_ABI,
    provider,
  );

  const [navRaw, snapshot] = await Promise.all([
    ledger.getNAV(),
    ledger.getVaultSnapshot(),
  ]);

  const [fungibles] = snapshot;
  const activeFungibles = fungibles.filter(
    (f: { active: boolean }) => f.active,
  );

  let weightedRisk = 0;
  let weightedYield = 0;
  for (const f of activeFungibles) {
    const pct = Number(f.allocationPct) / 100;
    weightedRisk += Number(f.riskScore) * pct;
    weightedYield += Number(f.yieldBps) * pct;
  }

  return {
    nav: Number(navRaw),
    riskScore: Math.round(weightedRisk),
    portfolioYield: weightedYield,
  };
}

async function fetchShareData(): Promise<{
  sharePrice: number | null;
  totalShares: number | null;
}> {
  if (!CONTRACTS.vaultShareToken) return { sharePrice: null, totalShares: null };

  try {
    const provider = getPublicProvider();
    const token = new ethers.Contract(
      CONTRACTS.vaultShareToken,
      VAULT_SHARE_TOKEN_ABI,
      provider,
    );
    const [price, supply] = await Promise.all([
      token.getSharePrice(),
      token.totalSupply(),
    ]);
    return {
      sharePrice: Number(price),
      totalShares: Number(supply),
    };
  } catch {
    return { sharePrice: null, totalShares: null };
  }
}

async function fetchReceiptTokens(): Promise<ReceiptTokenInfo[]> {
  if (!CONTRACTS.receiptToken) return [];

  try {
    const provider = getPublicProvider();
    const token = new ethers.Contract(
      CONTRACTS.receiptToken,
      RECEIPT_TOKEN_ABI,
      provider,
    );

    const [name, symbol, backing, price, supply, cap] = await Promise.all([
      token.name(),
      token.symbol(),
      token.getBackingInfo(),
      token.getReceiptPrice(),
      token.totalSupply(),
      token.supplyCap(),
    ]);

    return [
      {
        name,
        symbol,
        assetType: backing.assetType,
        assetLabel: backing.assetLabel,
        valuationUSD: Number(backing.valuationUSD),
        certScore: Number(backing.certScore),
        riskScore: Number(backing.riskScore),
        certified: backing.certified,
        certifiedAt: Number(backing.certifiedAt),
        receiptPrice: Number(price),
        totalSupply: Number(supply),
        supplyCap: Number(cap),
      },
    ];
  } catch {
    return [];
  }
}

async function fetchInvestorAttestations(): Promise<InvestorAttestation[]> {
  if (!CONTRACTS.attestation) return [];

  try {
    const provider = getPublicProvider();
    const contract = new ethers.Contract(
      CONTRACTS.attestation,
      ATTESTATION_ABI,
      provider,
    );

    const allTokens = [
      CONTRACTS.bondGov,
      CONTRACTS.recvAcme,
      CONTRACTS.recvBeta,
      CONTRACTS.stableUsdr,
      CONTRACTS.picassoNft,
      CONTRACTS.warholNft,
      CONTRACTS.vaultLedger,
    ];

    const results = await Promise.allSettled(
      allTokens.map((t) => contract.getAttestations(t)),
    );

    const attestations: InvestorAttestation[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const raw of result.value) {
        attestations.push({
          timestamp: Number(raw.timestamp),
          decisionType: Number(raw.decisionType),
          decisionOrigin: Number(raw.decisionOrigin),
          approved: raw.approved,
          quorumVotes: Number(raw.quorumVotes),
          quorumTotal: Number(raw.quorumTotal),
          nav: Number(raw.nav),
          riskScore: Number(raw.riskScore),
          portfolioBreakdown: raw.portfolioBreakdown,
          yieldHistory: raw.yieldHistory,
        });
      }
    }

    attestations.sort((a, b) => b.timestamp - a.timestamp);
    return attestations.slice(0, 20);
  } catch {
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function fetchInvestorData(): Promise<InvestorData> {
  const [aggregated, shares, receiptTokens, attestations] = await Promise.all([
    fetchAggregatedMetrics(),
    fetchShareData(),
    fetchReceiptTokens(),
    fetchInvestorAttestations(),
  ]);

  return {
    metrics: {
      ...aggregated,
      sharePrice: shares.sharePrice,
      totalShares: shares.totalShares,
      sharesAvailable: shares.sharePrice !== null,
    },
    receiptTokens,
    attestations,
    timestamp: Date.now(),
  };
}
