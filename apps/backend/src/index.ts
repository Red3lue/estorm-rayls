import { observe } from "./modules/observe/index.js";
import { think, DefaultStrategy } from "./modules/think/index.js";
import { execute } from "./modules/execute/index.js";
import { attest } from "./modules/attest/index.js";
import { ClaudeCodeAdapter } from "./adapters/claudeCode.js";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Sovereign Vault Protocol — AI Agent    ║");
  console.log("║   Observe → Think → Execute → Attest     ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const snapshot = await observe();
  const strategy = new DefaultStrategy();
  const llm = new ClaudeCodeAdapter();
  const thinkResult = await think(snapshot, strategy, llm);
  const executeResult = await execute(thinkResult.quorum, snapshot);
  const attestResults = await attest(thinkResult.quorum, snapshot);

  console.log(`[main] Execute: ${executeResult.outcomes.length} proposals submitted`);
  console.log(`[main] Attest: ${attestResults.length} attestations written`);
}

main().catch(err => { console.error("[main] Fatal:", err); process.exit(1); });
