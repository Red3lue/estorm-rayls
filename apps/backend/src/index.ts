import { observe } from "./modules/observe/index.js";
import { think, DefaultStrategy } from "./modules/think/index.js";
import { attest } from "./modules/attest/index.js";
import { ClaudeCodeAdapter } from "./adapters/claudeCode.js";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Sovereign Vault Protocol — AI Agent    ║");
  console.log("║   Observe → Think → Attest               ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const snapshot = await observe();
  const strategy = new DefaultStrategy();
  const llm = new ClaudeCodeAdapter();
  const thinkResult = await think(snapshot, strategy, llm);

  const attestResults = await attest(thinkResult.quorum, snapshot);

  const approved = [...thinkResult.quorum.rebalance, ...thinkResult.quorum.certify, ...thinkResult.quorum.issue].filter(a => a.approved);
  console.log(`[main] Quorum: ${approved.length} approved`);
  console.log(`[main] Attested: ${attestResults.length} tx(s)`);
  for (const r of attestResults) {
    console.log(`[main]   ${r.txHash} (block ${r.blockNumber})`);
  }
}

main().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
