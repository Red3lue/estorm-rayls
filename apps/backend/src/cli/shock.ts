import { injectShock } from "../modules/shock/index.js";

/**
 * CLI: inject a market shock.
 *
 * Usage:
 *   npx tsx src/cli/shock.ts RECV-ACME-90D 90 "Credit downgrade"
 *   npx tsx src/cli/shock.ts BOND-GOV-6M 60 "Interest rate hike" 250
 */
async function main() {
  const [asset, riskStr, reason, yieldStr] = process.argv.slice(2);

  if (!asset || !riskStr || !reason) {
    console.error("Usage: tsx src/cli/shock.ts <ASSET_SYMBOL> <NEW_RISK_SCORE> <REASON> [NEW_YIELD_BPS]");
    console.error("Example: tsx src/cli/shock.ts RECV-ACME-90D 90 \"Credit downgrade\"");
    process.exit(1);
  }

  const result = await injectShock({
    asset,
    newRiskScore: Number(riskStr),
    newYieldBps: yieldStr ? Number(yieldStr) : undefined,
    reason,
  });

  console.log("\nShock applied:");
  console.log(`  Asset: ${result.asset}`);
  console.log(`  Risk: ${result.previousRiskScore} → ${result.newRiskScore}`);
  console.log(`  Tx: ${result.txHash}`);
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
