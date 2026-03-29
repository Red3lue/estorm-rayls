import { observe } from "./modules/observe/index.js";
import { think, DefaultStrategy } from "./modules/think/index.js";
import { execute } from "./modules/execute/index.js";
import { attest } from "./modules/attest/index.js";
import { ClaudeCodeAdapter } from "./adapters/claudeCode.js";
import { startServer } from "./api/server.js";

// ─── API Server ───────────────────────────────────────────────────────────────
// Starts the Express API so the attestation contract can be deployed and
// written to via HTTP, independently of the agent loop.
startServer(Number(process.env.API_PORT ?? 3001));

// ─── Agent Loop ───────────────────────────────────────────────────────────────
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
