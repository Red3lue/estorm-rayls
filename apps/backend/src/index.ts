import { observe } from "./modules/observe/index.js";
import { think, DefaultStrategy } from "./modules/think/index.js";
import { ClaudeCodeAdapter } from "./adapters/claudeCode.js";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Sovereign Vault Protocol — AI Agent    ║");
  console.log("║   Observe → Think (US-2C.1 + US-2C.2)   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const snapshot = await observe();
  const strategy = new DefaultStrategy();
  const llm = new ClaudeCodeAdapter();
  const result = await think(snapshot, strategy, llm);

  const approved = [...result.quorum.rebalance, ...result.quorum.certify, ...result.quorum.issue].filter(a => a.approved);
  const rejected = [...result.quorum.rebalance, ...result.quorum.certify, ...result.quorum.issue].filter(a => !a.approved);

  console.log(`[main] Quorum complete: ${approved.length} approved, ${rejected.length} rejected`);
  console.log(`[main] Valid agents: ${result.quorum.rawDecisions.length}/${result.quorum.totalAgents}`);
  console.log(`[main] Duration: ${result.durationMs}ms`);
}

main().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
