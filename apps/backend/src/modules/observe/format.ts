import { ethers } from "ethers";
import type { VaultSnapshot } from "../../types/vault.js";

export function formatSnapshot(s: VaultSnapshot): void {
  console.log("\n[OBSERVE] ──────── VAULT SNAPSHOT ────────");
  console.log(`[OBSERVE] Timestamp:      ${new Date(s.timestamp * 1000).toISOString()}`);
  console.log(`[OBSERVE] NAV (fungible): $${s.nav.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`[OBSERVE] Total Value:    $${s.totalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`[OBSERVE] Risk:           ${s.portfolioRiskScore}/100`);
  console.log(`[OBSERVE] Yield:          ${s.portfolioYield}%`);
  console.log(`[OBSERVE] Liquidity:      ${(s.liquidityRatio * 100).toFixed(2)}%`);

  if (s.fungibles.length > 0) {
    console.log("\n[OBSERVE] ── ERC-20 Assets ──");
    console.log(`${"Symbol".padEnd(16)} ${"Balance".padStart(20)} ${"Value (USD)".padStart(14)} ${"Alloc%".padStart(7)} ${"Yield".padStart(6)} ${"Risk".padStart(5)}`);
    console.log("─".repeat(72));
    for (const a of s.fungibles) {
      const bal = Number(ethers.formatUnits(a.balance, a.decimals));
      console.log(`${a.symbol.padEnd(16)} ${bal.toLocaleString("en-US", { maximumFractionDigits: 2 }).padStart(20)} ${("$" + a.value.toLocaleString("en-US", { maximumFractionDigits: 2 })).padStart(14)} ${(a.allocationPct + "%").padStart(7)} ${(a.yieldRate + "%").padStart(6)} ${String(a.riskScore).padStart(5)}`);
    }
  }

  if (s.nonFungibles.length > 0) {
    console.log("\n[OBSERVE] ── ERC-721 Assets ──");
    console.log(`${"Symbol".padEnd(16)} ${"Token ID".padStart(10)} ${"Valuation".padStart(14)} ${"Status".padStart(14)} ${"Risk".padStart(5)}`);
    console.log("─".repeat(64));
    for (const n of s.nonFungibles) {
      console.log(`${n.symbol.padEnd(16)} ${n.tokenId.toString().padStart(10)} ${("$" + n.valuation.toLocaleString("en-US")).padStart(14)} ${n.certificationStatus.padStart(14)} ${String(n.riskScore).padStart(5)}`);
    }
  } else {
    console.log("\n[OBSERVE] No ERC-721 assets owned by agent.");
  }
  console.log("[OBSERVE] ────────────────────────────────\n");
}
