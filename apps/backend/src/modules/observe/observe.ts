import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getPrivacyNodeProvider, getAgentWallet } from "../../clients/privacyNode.js";
import { ERC20_ABI, ERC721_ABI, VAULT_LEDGER_ABI } from "../../abis/index.js";
import { CertificationStatus } from "../../types/vault.js";
import type { VaultSnapshot } from "../../types/vault.js";
import { formatSnapshot } from "./format.js";
import {
  buildFungibleAsset, buildNonFungibleAsset, buildSnapshot, mapCertificationStatus,
  type RawErc20Read, type RawErc721Read, type Erc20Meta, type Erc721Meta,
} from "./computation.js";

interface TokenDef {
  addressKey: keyof typeof config.contracts;
  symbol: string;
  name: string;
}

interface NftDef extends TokenDef {
  tokenId: bigint;
}

const ERC20_TOKENS: TokenDef[] = [
  { addressKey: "bondGov", symbol: "BOND-GOV-6M", name: "Government Bond 6M" },
  { addressKey: "recvAcme", symbol: "RECV-ACME-90D", name: "Receivable ACME 90D" },
  { addressKey: "recvBeta", symbol: "RECV-BETA-30D", name: "Receivable BETA 30D" },
  { addressKey: "stableUsdr", symbol: "STABLE-USDr", name: "Stablecoin USDr" },
];

const ERC721_TOKENS: NftDef[] = [
  { addressKey: "picassoNft", symbol: "ART-PICASSO-01", name: "Picasso Painting", tokenId: 1n },
  { addressKey: "warholNft", symbol: "ART-WARHOL-01", name: "Warhol Artwork", tokenId: 1n },
];

async function readErc20(provider: ethers.JsonRpcProvider, agent: string, def: TokenDef): Promise<RawErc20Read> {
  const addr = config.contracts[def.addressKey];
  try {
    const c = new ethers.Contract(addr, ERC20_ABI, provider);
    const [balance, decimals] = await Promise.all([c.balanceOf(agent) as Promise<bigint>, c.decimals() as Promise<number>]);
    return { address: addr, symbol: def.symbol, name: def.name, balance, decimals: Number(decimals) };
  } catch (err) {
    console.warn(`[observe] Failed to read ${def.symbol} at ${addr}:`, (err as Error).message);
    return { address: addr, symbol: def.symbol, name: def.name, balance: 0n, decimals: 18 };
  }
}

async function readErc721(provider: ethers.JsonRpcProvider, agent: string, def: NftDef): Promise<RawErc721Read> {
  const addr = config.contracts[def.addressKey];
  try {
    const c = new ethers.Contract(addr, ERC721_ABI, provider);
    const owner = await c.ownerOf(def.tokenId) as string;
    return { address: addr, symbol: def.symbol, name: def.name, tokenId: def.tokenId, owned: owner.toLowerCase() === agent.toLowerCase() };
  } catch {
    return { address: addr, symbol: def.symbol, name: def.name, tokenId: def.tokenId, owned: false };
  }
}

async function readVaultLedger(provider: ethers.JsonRpcProvider): Promise<{ erc20Meta: Map<string, Erc20Meta>; erc721Meta: Map<string, Erc721Meta> }> {
  const erc20Meta = new Map<string, Erc20Meta>();
  const erc721Meta = new Map<string, Erc721Meta>();
  if (!config.contracts.vaultLedger) return { erc20Meta, erc721Meta };

  try {
    const ledger = new ethers.Contract(config.contracts.vaultLedger, VAULT_LEDGER_ABI, provider);
    const [erc20s, erc721s] = await ledger.getVaultSnapshot();

    for (const a of erc20s) {
      if (!a.active) continue;
      erc20Meta.set(a.tokenAddress.toLowerCase(), {
        allocationPct: Number(a.allocationPct),       // uint8 0-100
        riskScore: Number(a.riskScore),                // uint8 0-100
        yieldRate: Number(a.yieldBps) / 100,           // bps → percentage (420 → 4.2%)
        balance: a.balance as bigint,                  // VaultLedger-tracked balance
        valueUSD: Number(a.valueUSD),                  // cents
      });
    }

    for (const a of erc721s) {
      if (!a.active) continue;
      const key = `${a.tokenAddress.toLowerCase()}-${a.tokenId}`;
      erc721Meta.set(key, {
        valuation: Number(a.valuationUSD) / 100,       // cents → dollars
        certificationStatus: a.certified ? CertificationStatus.CERTIFIED : CertificationStatus.UNCERTIFIED,
        riskScore: Number(a.riskScore),                // uint8 0-100
      });
    }
  } catch (err) {
    console.warn("[observe] VaultLedger read failed, using defaults:", (err as Error).message);
  }
  return { erc20Meta, erc721Meta };
}

export async function observe(): Promise<VaultSnapshot> {
  console.log("\n[OBSERVE] ========================================");
  console.log("[OBSERVE] Starting vault observation...");
  const t0 = Date.now();

  const provider = getPrivacyNodeProvider();
  const agent = getAgentWallet().address;
  console.log(`[OBSERVE] Agent: ${agent}`);

  const active20 = ERC20_TOKENS.filter(t => config.contracts[t.addressKey] !== "");
  const active721 = ERC721_TOKENS.filter(t => config.contracts[t.addressKey] !== "");

  if (active20.length === 0 && active721.length === 0) {
    console.warn("[OBSERVE] No token addresses configured");
  }

  const [erc20s, erc721s, ledger] = await Promise.all([
    Promise.all(active20.map(t => readErc20(provider, agent, t))),
    Promise.all(active721.map(t => readErc721(provider, agent, t))),
    readVaultLedger(provider),
  ]);

  const fungibles = erc20s.map(t => buildFungibleAsset(t, ledger.erc20Meta.get(t.address.toLowerCase())));

  // Include NFTs that are either owned by agent OR tracked in VaultLedger
  const nonFungibles = erc721s
    .filter(t => t.owned || ledger.erc721Meta.has(`${t.address.toLowerCase()}-${t.tokenId}`))
    .map(t => buildNonFungibleAsset(t, ledger.erc721Meta.get(`${t.address.toLowerCase()}-${t.tokenId}`)));

  const snapshot = buildSnapshot(fungibles, nonFungibles);

  console.log(`[OBSERVE] Done in ${Date.now() - t0}ms`);
  formatSnapshot(snapshot);
  return snapshot;
}
