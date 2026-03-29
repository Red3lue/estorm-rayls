import { injectOpportunity } from "../modules/opportunity/index.js";

/**
 * CLI: introduce a new asset to the vault.
 *
 * ERC-20:
 *   npx tsx src/cli/opportunity.ts erc20 0xABC... BOND-HY-3M 45 "New high-yield bond" 900
 *
 * ERC-721:
 *   npx tsx src/cli/opportunity.ts erc721 0xDEF... ART-MONET-01 35 "New painting" 1 30000000
 */
async function main() {
  const [type, tokenAddress, symbol, riskStr, reason, ...rest] = process.argv.slice(2);

  if (!type || !tokenAddress || !symbol || !riskStr || !reason) {
    console.error("Usage:");
    console.error("  ERC-20:  tsx src/cli/opportunity.ts erc20 <ADDRESS> <SYMBOL> <RISK> <REASON> [YIELD_BPS]");
    console.error("  ERC-721: tsx src/cli/opportunity.ts erc721 <ADDRESS> <SYMBOL> <RISK> <REASON> <TOKEN_ID> <VALUATION_CENTS>");
    process.exit(1);
  }

  if (type === "erc20") {
    const result = await injectOpportunity({
      type: "erc20",
      tokenAddress,
      symbol,
      riskScore: Number(riskStr),
      yieldBps: rest[0] ? Number(rest[0]) : undefined,
      reason,
    });
    console.log(`\nRegistered ERC-20: ${result.symbol} — tx: ${result.txHash}`);
  } else if (type === "erc721") {
    const result = await injectOpportunity({
      type: "erc721",
      tokenAddress,
      symbol,
      riskScore: Number(riskStr),
      tokenId: rest[0] ? Number(rest[0]) : 1,
      valuationUSD: rest[1] ? Number(rest[1]) : 0,
      reason,
    });
    console.log(`\nRegistered ERC-721: ${result.symbol} — tx: ${result.txHash}`);
  } else {
    console.error("Type must be 'erc20' or 'erc721'");
    process.exit(1);
  }
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
