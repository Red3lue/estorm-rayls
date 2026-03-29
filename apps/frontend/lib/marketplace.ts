import { ethers } from "ethers";
import {
  PUBLIC_CHAIN_RPC,
  CONTRACTS,
  DEPLOYER_KEY,
} from "./config";
import {
  MARKETPLACE_ABI,
  VAULT_SHARE_TOKEN_ABI,
  RECEIPT_TOKEN_ABI,
  ERC20_ABI,
} from "./abis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketplaceListing {
  id: number;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenType: "share" | "receipt";
  amount: number;
  price: number;
  active: boolean;
  certSummary: string | null;
}

export interface TokenHolding {
  address: string;
  symbol: string;
  type: "share" | "receipt";
  balance: number;
}

export interface ShareInfo {
  nav: number;
  sharePrice: number;
  riskScore: number;
}

export interface MarketplaceData {
  listings: MarketplaceListing[];
  holdings: TokenHolding[];
  shareInfo: ShareInfo | null;
  timestamp: number;
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

function getInvestorAddress(): string {
  return new ethers.Wallet(DEPLOYER_KEY).address;
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function fetchActiveListings(): Promise<MarketplaceListing[]> {
  if (!CONTRACTS.marketplace) return [];

  const provider = getProvider();
  const marketplace = new ethers.Contract(
    CONTRACTS.marketplace,
    MARKETPLACE_ABI,
    provider,
  );

  try {
    const activeIds: bigint[] = await marketplace.getActiveListings();

    const results = await Promise.allSettled(
      activeIds.map((id) => marketplace.getListing(id)),
    );

    const listings: MarketplaceListing[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;

      const raw = result.value;
      const id = Number(activeIds[i]);
      const isShare =
        raw.token.toLowerCase() === CONTRACTS.vaultShareToken.toLowerCase();
      const isReceipt =
        raw.token.toLowerCase() === CONTRACTS.receiptToken.toLowerCase();

      let tokenName = raw.token.slice(0, 10);
      let tokenSymbol = "???";
      let certSummary: string | null = null;

      try {
        const token = new ethers.Contract(raw.token, ERC20_ABI, provider);
        const [name, symbol] = await Promise.all([
          token.name(),
          token.symbol(),
        ]);
        tokenName = name;
        tokenSymbol = symbol;
      } catch {
        /* token may not exist */
      }

      if (isReceipt && CONTRACTS.receiptToken) {
        try {
          const receipt = new ethers.Contract(
            CONTRACTS.receiptToken,
            RECEIPT_TOKEN_ABI,
            provider,
          );
          const backing = await receipt.getBackingInfo();
          certSummary = backing.certified
            ? `AI Certified — ${backing.assetLabel}, confidence ${Number(backing.certScore)}/100, risk ${Number(backing.riskScore)}/100`
            : `Pending certification — ${backing.assetLabel}`;
        } catch {
          /* no backing info */
        }
      }

      listings.push({
        id,
        tokenAddress: raw.token,
        tokenName,
        tokenSymbol,
        tokenType: isShare ? "share" : isReceipt ? "receipt" : "share",
        amount: Number(ethers.formatUnits(raw.amount, 18)),
        price: Number(ethers.formatUnits(raw.price, 18)),
        active: true,
        certSummary,
      });
    }

    return listings;
  } catch {
    return [];
  }
}

async function fetchHoldings(): Promise<TokenHolding[]> {
  if (!DEPLOYER_KEY) return [];

  const provider = getProvider();
  const investor = getInvestorAddress();
  const holdings: TokenHolding[] = [];

  const tokens = [
    { address: CONTRACTS.vaultShareToken, type: "share" as const },
    { address: CONTRACTS.receiptToken, type: "receipt" as const },
  ];

  for (const { address, type } of tokens) {
    if (!address) continue;
    try {
      const token = new ethers.Contract(address, ERC20_ABI, provider);
      const [symbol, balance] = await Promise.all([
        token.symbol(),
        token.balanceOf(investor),
      ]);
      holdings.push({
        address,
        symbol,
        type,
        balance: Number(ethers.formatUnits(balance, 18)),
      });
    } catch {
      /* not deployed */
    }
  }

  return holdings;
}

async function fetchShareInfo(): Promise<ShareInfo | null> {
  if (!CONTRACTS.vaultShareToken) return null;

  try {
    const provider = getProvider();
    const share = new ethers.Contract(
      CONTRACTS.vaultShareToken,
      VAULT_SHARE_TOKEN_ABI,
      provider,
    );
    const [nav, price] = await Promise.all([
      share.getNAV(),
      share.getSharePrice(),
    ]);
    return {
      nav: Number(nav) / 100,           // cents → dollars
      sharePrice: Number(price) / 100,   // cents → dollars
      riskScore: 0,
    };
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function fetchMarketplaceData(): Promise<MarketplaceData> {
  const [listings, holdings, shareInfo] = await Promise.all([
    fetchActiveListings(),
    fetchHoldings(),
    fetchShareInfo(),
  ]);

  return { listings, holdings, shareInfo, timestamp: Date.now() };
}

// ── Write: Buy ───────────────────────────────────────────────────────────────

export async function buyListing(
  listingId: number,
  price: number,
): Promise<{ txHash: string }> {
  const provider = getProvider();
  const wallet = new ethers.Wallet(DEPLOYER_KEY, provider);
  const marketplace = new ethers.Contract(
    CONTRACTS.marketplace,
    MARKETPLACE_ABI,
    wallet,
  );
  const tx = await marketplace["buy(uint256)"](listingId, {
    value: price,
    gasLimit: 500_000,
  });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}
