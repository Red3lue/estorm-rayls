import { ethers } from "ethers";
import { config } from "./config/index.js";
import { observe } from "./modules/observe/index.js";
import { think, DefaultStrategy } from "./modules/think/index.js";
import { execute } from "./modules/execute/index.js";
import { attest } from "./modules/attest/index.js";
import { ClaudeCodeAdapter } from "./adapters/claudeCode.js";
import { getAgentWallet } from "./clients/privacyNode.js";
import { VAULT_POLICY_ABI } from "./abis/index.js";
import { ProposalStatus } from "./types/execute.js";
import type { VaultSnapshot } from "./types/vault.js";

const strategy = new DefaultStrategy();
const llm = new ClaudeCodeAdapter();

let running = true;
let cycleNumber = 0;

function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    console.log(`\n[LOOP] Received ${signal} — stopping after current cycle...`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function checkPendingAndWithdraw(snapshot: VaultSnapshot): Promise<number> {
  if (!config.contracts.vaultPolicy) return 0;

  try {
    const wallet = getAgentWallet();
    const policy = new ethers.Contract(config.contracts.vaultPolicy, VAULT_POLICY_ABI, wallet);
    const pendingId = Number(await policy.pendingProposalId());

    if (pendingId === 0) return 0;

    console.log(`[LOOP] Pending proposal #${pendingId} detected`);

    // Check if the pending proposal is still valid by reading its details
    const pending = await policy.getPendingProposal();
    const navAtProposal = Number(pending.valueUSD);
    const currentNav = Math.round(snapshot.nav * 100); // cents

    // If NAV drifted significantly since the proposal, it may be invalidated
    const drift = Math.abs(currentNav - navAtProposal) / (navAtProposal || 1);
    if (drift > 0.10) {
      console.log(`[LOOP] NAV drifted ${(drift * 100).toFixed(1)}% since proposal — withdrawing #${pendingId}`);
      const tx = await policy.withdraw(pendingId);
      await tx.wait();
      console.log(`[LOOP] Withdrawn proposal #${pendingId}`);
      return 0;
    }

    return pendingId;
  } catch (err) {
    console.warn("[LOOP] Failed to check pending proposal:", (err as Error).message);
    return 0;
  }
}

function logCycleSummary(
  cycle: number,
  navBefore: number,
  navAfter: number,
  thinkDuration: number,
  approvedActions: number,
  rejectedActions: number,
  executedCount: number,
  pendingId: number,
  attestCount: number,
  cycleDuration: number,
): void {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║   Cycle #${cycle} Summary`);
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  NAV:       $${navBefore.toLocaleString()} → $${navAfter.toLocaleString()}`);
  console.log(`║  Quorum:    ${approvedActions} approved, ${rejectedActions} rejected (${thinkDuration}ms)`);
  console.log(`║  Executed:  ${executedCount} proposals submitted`);
  console.log(`║  Attested:  ${attestCount} on-chain attestations`);
  console.log(`║  Pending:   ${pendingId > 0 ? `proposal #${pendingId} awaiting manager` : "none"}`);
  console.log(`║  Duration:  ${(cycleDuration / 1000).toFixed(1)}s`);
  console.log("╚══════════════════════════════════════════╝\n");
}

async function runCycle(): Promise<void> {
  cycleNumber++;
  const cycleStart = Date.now();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  CYCLE #${cycleNumber} — ${new Date().toISOString()}`);
  console.log(`${"═".repeat(60)}`);

  let navBefore = 0;
  let navAfter = 0;
  let thinkDuration = 0;
  let approvedActions = 0;
  let rejectedActions = 0;
  let executedCount = 0;
  let pendingId = 0;
  let attestCount = 0;

  // ── OBSERVE ──
  let snapshot: VaultSnapshot;
  try {
    snapshot = await observe();
    navBefore = snapshot.nav;
  } catch (err) {
    console.error("[LOOP] OBSERVE failed:", (err as Error).message);
    return;
  }

  // ── PENDING CHECK ──
  try {
    pendingId = await checkPendingAndWithdraw(snapshot);
  } catch (err) {
    console.error("[LOOP] PENDING CHECK failed:", (err as Error).message);
  }

  // ── THINK ──
  let thinkResult;
  try {
    thinkResult = await think(snapshot, strategy, llm);
    thinkDuration = thinkResult.durationMs;
    const allActions = [...thinkResult.quorum.rebalance, ...thinkResult.quorum.certify, ...thinkResult.quorum.issue];
    approvedActions = allActions.filter(a => a.approved).length;
    rejectedActions = allActions.filter(a => !a.approved).length;
  } catch (err) {
    console.error("[LOOP] THINK failed:", (err as Error).message);
    return;
  }

  // ── EXECUTE ──
  try {
    const executeResult = await execute(thinkResult.quorum, snapshot);
    executedCount = executeResult.outcomes.length;
    pendingId = executeResult.pendingProposalId;
  } catch (err) {
    console.error("[LOOP] EXECUTE failed:", (err as Error).message);
  }

  // ── ATTEST ──
  try {
    const attestResults = await attest(thinkResult.quorum, snapshot);
    attestCount = attestResults.length;
  } catch (err) {
    console.error("[LOOP] ATTEST failed:", (err as Error).message);
  }

  // ── RE-OBSERVE for NAV after ──
  try {
    const snapshotAfter = await observe();
    navAfter = snapshotAfter.nav;
  } catch {
    navAfter = navBefore;
  }

  logCycleSummary(
    cycleNumber, navBefore, navAfter, thinkDuration,
    approvedActions, rejectedActions, executedCount,
    pendingId, attestCount, Date.now() - cycleStart,
  );
}

export async function startLoop(): Promise<void> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Sovereign Vault Protocol — AI Agent    ║");
  console.log("║   Autonomous Loop (US-2C.6)              ║");
  console.log(`║   Interval: ${config.agent.loopIntervalMs / 1000}s                          ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  setupGracefulShutdown();

  while (running) {
    await runCycle();

    if (!running) break;

    console.log(`[LOOP] Waiting ${config.agent.loopIntervalMs / 1000}s before next cycle...`);
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, config.agent.loopIntervalMs);
      // Allow SIGINT/SIGTERM to break the wait
      const check = setInterval(() => {
        if (!running) { clearTimeout(timer); clearInterval(check); resolve(); }
      }, 500);
    });
  }

  console.log("[LOOP] Agent stopped gracefully.");
}
