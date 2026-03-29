import { ethers } from "ethers";
import {
  PUBLIC_CHAIN_RPC,
  CONTRACTS,
  DEPLOYER_KEY,
  BACKEND_API,
} from "./config";
import {
  MARKETPLACE_ABI,
  VAULT_SHARE_TOKEN_ABI,
  RECEIPT_TOKEN_ABI,
} from "./abis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Listing {
  id: number;
  tokenAddress: string;
  tokenName: string;
  tokenType: "share" | "receipt";
  assetType: number;
  amount: number;
  price: number;
  active: boolean;
  capitalRaised: number;
}

export interface IssuedToken {
  address: string;
  name: string;
  symbol: string;
  type: "share" | "receipt";
  totalSupply: number;
}

export interface IssuanceSnapshot {
  issuedTokens: IssuedToken[];
  listings: Listing[];
  totalCapitalRaised: number;
  pendingTeleports: PendingTeleport[];
  timestamp: number;
}

export interface PendingTeleport {
  direction: string;
  amount: string;
  status: string;
}

// ── Provider ─────────────────────────────────────────────────────────────────

let providerInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(PUBLIC_CHAIN_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function fetchIssuedTokens(): Promise<IssuedToken[]> {
  const provider = getProvider();
  const tokens: IssuedToken[] = [];

  if (CONTRACTS.vaultShareToken) {
    try {
      const share = new ethers.Contract(
        CONTRACTS.vaultShareToken,
        VAULT_SHARE_TOKEN_ABI,
        provider,
      );
      const [name, symbol, supply] = await Promise.all([
        share.name(),
        share.symbol(),
        share.totalSupply(),
      ]);
      tokens.push({
        address: CONTRACTS.vaultShareToken,
        name,
        symbol,
        type: "share",
        totalSupply: Number(supply),
      });
    } catch {
      /* not deployed */
    }
  }

  if (CONTRACTS.receiptToken) {
    try {
      const receipt = new ethers.Contract(
        CONTRACTS.receiptToken,
        RECEIPT_TOKEN_ABI,
        provider,
      );
      const [name, symbol, supply] = await Promise.all([
        receipt.name(),
        receipt.symbol(),
        receipt.totalSupply(),
      ]);
      tokens.push({
        address: CONTRACTS.receiptToken,
        name,
        symbol,
        type: "receipt",
        totalSupply: Number(supply),
      });
    } catch {
      /* not deployed */
    }
  }

  return tokens;
}

async function fetchListings(
  issuedTokens: IssuedToken[],
): Promise<Listing[]> {
  if (!CONTRACTS.marketplace) return [];

  const provider = getProvider();
  const marketplace = new ethers.Contract(
    CONTRACTS.marketplace,
    MARKETPLACE_ABI,
    provider,
  );

  try {
    const activeIds: bigint[] = await marketplace.getActiveListings();
    const totalCount = Number(await marketplace.getListingCount());

    const allIds = Array.from({ length: totalCount }, (_, i) => i + 1);
    const listingResults = await Promise.allSettled(
      allIds.map((id) => marketplace.getListing(id)),
    );

    const tokenMap = new Map(issuedTokens.map((t) => [t.address.toLowerCase(), t]));
    const activeSet = new Set(activeIds.map((id) => Number(id)));

    const listings: Listing[] = [];

    for (let i = 0; i < listingResults.length; i++) {
      const result = listingResults[i];
      if (result.status !== "fulfilled") continue;

      const raw = result.value;
      const id = i + 1;
      const token = tokenMap.get(raw.token.toLowerCase());

      listings.push({
        id,
        tokenAddress: raw.token,
        tokenName: token?.symbol ?? raw.token.slice(0, 10),
        tokenType: token?.type ?? (Number(raw.assetType) === 0 ? "share" : "receipt"),
        assetType: Number(raw.assetType),
        amount: Number(raw.amount),
        price: Number(raw.price),
        active: activeSet.has(id),
        capitalRaised: activeSet.has(id) ? 0 : Number(raw.price) * Number(raw.amount),
      });
    }

    return listings;
  } catch {
    return [];
  }
}

async function fetchPendingTeleports(): Promise<PendingTeleport[]> {
  try {
    const res = await fetch(`${BACKEND_API}/api/teleport/balance`);
    if (!res.ok) return [];
    const data = await res.json();
    const teleports: PendingTeleport[] = [];
    if (data.nativeUSDr && BigInt(data.nativeUSDr) > BigInt(0)) {
      teleports.push({
        direction: "Public → Privacy",
        amount: data.nativeUSDr,
        status: "available",
      });
    }
    return teleports;
  } catch {
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function fetchIssuanceData(): Promise<IssuanceSnapshot> {
  const issuedTokens = await fetchIssuedTokens();
  const [listings, pendingTeleports] = await Promise.all([
    fetchListings(issuedTokens),
    fetchPendingTeleports(),
  ]);

  const totalCapitalRaised = listings.reduce((sum, l) => sum + l.capitalRaised, 0);

  return {
    issuedTokens,
    listings,
    totalCapitalRaised,
    pendingTeleports,
    timestamp: Date.now(),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function delistListing(
  listingId: number,
): Promise<{ txHash: string }> {
  const provider = getProvider();
  const wallet = new ethers.Wallet(DEPLOYER_KEY, provider);
  const marketplace = new ethers.Contract(
    CONTRACTS.marketplace,
    MARKETPLACE_ABI,
    wallet,
  );
  const tx = await marketplace.delist(listingId, { gasLimit: 300_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function listToken(params: {
  tokenAddress: string;
  assetType: number;
  tokenId: number;
  amount: number;
  price: number;
}): Promise<{ txHash: string; listingId: number }> {
  const provider = getProvider();
  const wallet = new ethers.Wallet(DEPLOYER_KEY, provider);
  const marketplace = new ethers.Contract(
    CONTRACTS.marketplace,
    MARKETPLACE_ABI,
    wallet,
  );
  const tx = await marketplace.list(
    params.tokenAddress,
    params.assetType,
    params.tokenId,
    params.amount,
    params.price,
    { gasLimit: 500_000 },
  );
  const receipt = await tx.wait();
  const listingId = Number(
    receipt.logs?.[0]?.topics?.[1] ?? 0,
  );
  return { txHash: receipt.hash, listingId };
}
