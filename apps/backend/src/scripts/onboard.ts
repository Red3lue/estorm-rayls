#!/usr/bin/env tsx
/**
 * US-2A.5: User Onboarding & Token Registration
 *
 * Registers the agent wallet via the Rayls Backend API, then registers
 * and approves all vault tokens so they become eligible for teleport
 * (Private ↔ Public bridging).
 *
 * Usage:
 *   npx tsx src/scripts/onboard.ts                  # full flow
 *   npx tsx src/scripts/onboard.ts --tokens-only    # skip user onboarding
 *   npx tsx src/scripts/onboard.ts --status         # check token status
 */
import "dotenv/config";
import { ethers } from "ethers";
import {
  registerUser,
  approveUser,
  registerToken,
  approveToken,
} from "../clients/raylsBackend.js";
import { config } from "../config/index.js";

// ─── Token definitions (from .env / deployed contracts) ─────────────────────

interface TokenDef {
  name: string;
  symbol: string;
  envKey: string;
  standard: 1 | 2;
}

const TOKENS: TokenDef[] = [
  { name: "Government Bond 6M",    symbol: "BOND-GOV-6M",    envKey: "BOND_GOV_ADDRESS",    standard: 1 },
  { name: "ACME Receivable 90D",   symbol: "RECV-ACME-90D",  envKey: "RECV_ACME_ADDRESS",   standard: 1 },
  { name: "Beta Receivable 30D",   symbol: "RECV-BETA-30D",  envKey: "RECV_BETA_ADDRESS",   standard: 1 },
  { name: "Stable USDr",           symbol: "STABLE-USDr",    envKey: "STABLE_USDR_ADDRESS", standard: 1 },
  { name: "Sovereign Vault: Picasso", symbol: "ART-PICASSO-01", envKey: "PICASSO_NFT_ADDRESS", standard: 2 },
  { name: "Sovereign Vault: Warhol",  symbol: "ART-WARHOL-01",  envKey: "WARHOL_NFT_ADDRESS",  standard: 2 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function resolveAddress(envKey: string): string {
  const addr = process.env[envKey] ?? "";
  if (!addr) throw new Error(`Missing env var ${envKey} — deploy tokens first`);
  return addr;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokensOnly = args.includes("--tokens-only");
  const statusOnly = args.includes("--status");

  const deployerAddr = new ethers.Wallet(config.keys.deployer).address;
  const userId = `estorm-vault-${deployerAddr.slice(2, 10).toLowerCase()}`;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  US-2A.5: User Onboarding & Token Registration");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Backend URL:  ${config.backendApi.url}`);
  console.log(`  User ID:      ${userId}`);
  console.log(`  Deployer:     ${deployerAddr}`);
  console.log("");

  // ── Status check ────────────────────────────────────────────────────────
  if (statusOnly) {
    console.log("Token addresses from .env:");
    for (const t of TOKENS) {
      const addr = process.env[t.envKey] || "(not set)";
      console.log(`  ${t.symbol.padEnd(16)} ${addr}`);
    }
    return;
  }

  // ── Step 1: User Onboarding ─────────────────────────────────────────────
  if (!tokensOnly) {
    console.log("─── Step 1: Register User ──────────────────────────────────");
    try {
      const result = await registerUser(userId);
      console.log("  Registered:");
      console.log(`    public_chain_address:  ${result.public_chain_address}`);
      console.log(`    private_chain_address: ${result.private_chain_address}`);
      console.log(`    status:                ${result.status}`);

      console.log("\n─── Step 2: Approve User ───────────────────────────────────");
      await approveUser(
        userId,
        result.public_chain_address,
        result.private_chain_address,
      );
      console.log("  User approved (status → 1)");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("409") || msg.includes("already") || msg.includes("conflict")) {
        console.log("  User already registered — skipping");
      } else {
        console.error("  Onboarding error:", msg);
        console.log("  Continuing with token registration...");
      }
    }
    console.log("");
  }

  // ── Step 3: Register Tokens ─────────────────────────────────────────────
  console.log("─── Step 3: Register Tokens ────────────────────────────────");
  for (const t of TOKENS) {
    const addr = resolveAddress(t.envKey);
    const stdLabel = t.standard === 1 ? "ERC-20" : "ERC-721";
    try {
      await registerToken(t.name, t.symbol, addr, t.standard);
      console.log(`  ✓ ${t.symbol.padEnd(16)} ${stdLabel}  ${addr}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("409") || msg.includes("already") || msg.includes("conflict") || msg.includes("exists")) {
        console.log(`  ○ ${t.symbol.padEnd(16)} already registered`);
      } else {
        console.log(`  ✗ ${t.symbol.padEnd(16)} FAILED: ${msg}`);
      }
    }
  }
  console.log("");

  // ── Step 4: Approve Tokens ──────────────────────────────────────────────
  console.log("─── Step 4: Approve Tokens ─────────────────────────────────");
  for (const t of TOKENS) {
    const addr = resolveAddress(t.envKey);
    try {
      await approveToken(addr);
      console.log(`  ✓ ${t.symbol.padEnd(16)} approved (status → 1)`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already") || msg.includes("active")) {
        console.log(`  ○ ${t.symbol.padEnd(16)} already active`);
      } else {
        console.log(`  ✗ ${t.symbol.padEnd(16)} FAILED: ${msg}`);
      }
    }
  }
  console.log("");

  // ── Step 5: Wait for Mirror Deployment ──────────────────────────────────
  console.log("─── Step 5: Wait for Mirror Deployment (~30-60s) ────────────");
  console.log("  After token approval, the relayer auto-deploys mirror");
  console.log("  contracts (PublicChainERC20) on the Public Chain.");
  console.log("");
  console.log("  Waiting 45 seconds...");
  await sleep(45_000);

  // ── Step 6: Verify mirrors ──────────────────────────────────────────────
  console.log("\n─── Step 6: Verify Mirror Contracts ────────────────────────");
  console.log("  Run the CheckBalance Foundry script to verify:");
  console.log("    forge script script/CheckBalance.s.sol --rpc-url $PUBLIC_CHAIN_RPC_URL");
  console.log("");
  console.log("  Or check the Public Chain explorer:");
  console.log("    https://testnet-explorer.rayls.com/");
  console.log("");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Onboarding complete. Tokens are now eligible for teleport.");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
