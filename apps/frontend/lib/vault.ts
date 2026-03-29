import { ethers } from "ethers";
import { PRIVACY_NODE_RPC, CONTRACTS } from "./config";
import { VAULT_LEDGER_ABI } from "./abis";
import type { FungibleAsset, NonFungibleAsset, VaultSnapshot } from "./types";

let providerInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(PRIVACY_NODE_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

export async function fetchVaultSnapshot(): Promise<VaultSnapshot> {
  const provider = getProvider();
  const ledger = new ethers.Contract(
    CONTRACTS.vaultLedger,
    VAULT_LEDGER_ABI,
    provider,
  );

  const [navRaw, snapshot] = await Promise.all([
    ledger.getNAV(),
    ledger.getVaultSnapshot(),
  ]);

  const [rawFungibles, rawNfts] = snapshot;

  const fungibles: FungibleAsset[] = rawFungibles
    .filter((f: { active: boolean }) => f.active)
    .map(
      (f: {
        tokenAddress: string;
        symbol: string;
        balance: bigint;
        valueUSD: bigint;
        allocationPct: number;
        riskScore: number;
        yieldBps: bigint;
        active: boolean;
      }) => ({
        address: f.tokenAddress,
        symbol: f.symbol,
        balance: Number(f.balance),
        valueUSD: Number(f.valueUSD),
        allocationPct: Number(f.allocationPct),
        riskScore: Number(f.riskScore),
        yieldBps: Number(f.yieldBps),
        active: f.active,
      }),
    );

  const nonFungibles: NonFungibleAsset[] = rawNfts
    .filter((n: { active: boolean }) => n.active)
    .map(
      (n: {
        tokenAddress: string;
        tokenId: bigint;
        symbol: string;
        valuationUSD: bigint;
        certified: boolean;
        certScore: number;
        riskScore: number;
        active: boolean;
      }) => ({
        address: n.tokenAddress,
        tokenId: Number(n.tokenId),
        symbol: n.symbol,
        valuationUSD: Number(n.valuationUSD),
        certified: n.certified,
        certScore: Number(n.certScore),
        riskScore: Number(n.riskScore),
        active: n.active,
      }),
    );

  return {
    nav: Number(navRaw),
    fungibles,
    nonFungibles,
    timestamp: Date.now(),
  };
}
