import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getPrivacyNodeProvider, getAgentWallet } from "../../clients/privacyNode.js";
import { VAULT_POLICY_ABI } from "../../abis/index.js";
import type { VaultSnapshot } from "../../types/vault.js";
import type { QuorumResult } from "../../types/think.js";
import { ProposalStatus, type ProposalOutcome, type ExecuteResult } from "../../types/execute.js";
import { encodeApprovedActions, type EncodedProposal } from "./encodeAction.js";

async function submitProposal(
  policy: ethers.Contract,
  proposal: EncodedProposal,
): Promise<ProposalOutcome> {
  const tx = await policy.propose(
    proposal.target,
    proposal.callData,
    proposal.category,
    proposal.reasoning,
    proposal.quorumVotes,
  );

  const receipt = await tx.wait();

  // Check which event was emitted to determine outcome
  const autoExecEvent = receipt.logs.find((l: ethers.Log) => {
    try {
      return policy.interface.parseLog(l)?.name === "ProposalAutoExecuted";
    } catch { return false; }
  });

  const pendingEvent = receipt.logs.find((l: ethers.Log) => {
    try {
      return policy.interface.parseLog(l)?.name === "ProposalPending";
    } catch { return false; }
  });

  if (autoExecEvent) {
    const parsed = policy.interface.parseLog(autoExecEvent)!;
    const proposalId = Number(parsed.args[0]);
    console.log(`[EXECUTE] AUTO_EXECUTED proposal #${proposalId} — tx: ${tx.hash}`);
    return { proposalId, status: ProposalStatus.AUTO_EXECUTED, txHash: tx.hash, decisionOrigin: "AI_QUORUM", reasoning: proposal.reasoning };
  }

  if (pendingEvent) {
    const parsed = policy.interface.parseLog(pendingEvent)!;
    const proposalId = Number(parsed.args[0]);
    console.log(`[EXECUTE] PENDING proposal #${proposalId} — awaiting manager approval`);
    return { proposalId, status: ProposalStatus.PENDING, txHash: tx.hash, decisionOrigin: "AI_QUORUM", reasoning: proposal.reasoning };
  }

  // Fallback — tx succeeded but no recognized event
  console.warn(`[EXECUTE] Proposal submitted but no recognized event — tx: ${tx.hash}`);
  return { proposalId: 0, status: ProposalStatus.AUTO_EXECUTED, txHash: tx.hash, decisionOrigin: "AI_QUORUM", reasoning: proposal.reasoning };
}

/**
 * EXECUTE MODULE — Operations via VaultPolicy.sol
 *
 * All operations go through VaultPolicy.propose(). The agent never calls
 * token contracts directly. VaultPolicy derives the true value on-chain
 * and applies governance rules (category, threshold, rate limit).
 */
export async function execute(
  quorum: QuorumResult,
  snapshot: VaultSnapshot,
): Promise<ExecuteResult> {
  console.log("\n[EXECUTE] ========================================");
  const t0 = Date.now();

  if (!config.contracts.vaultPolicy) {
    console.warn("[EXECUTE] No VAULT_POLICY_ADDRESS configured — skipping");
    return { outcomes: [], pendingProposalId: 0, durationMs: Date.now() - t0 };
  }

  if (!config.contracts.vaultLedger) {
    console.warn("[EXECUTE] No VAULT_LEDGER_ADDRESS configured — skipping");
    return { outcomes: [], pendingProposalId: 0, durationMs: Date.now() - t0 };
  }

  const wallet = getAgentWallet();
  const policy = new ethers.Contract(config.contracts.vaultPolicy, VAULT_POLICY_ABI, wallet);

  console.log(`[EXECUTE] Agent: ${wallet.address}`);
  console.log(`[EXECUTE] VaultPolicy: ${config.contracts.vaultPolicy}`);

  // Check for existing pending proposal
  const currentPending = Number(await policy.pendingProposalId());
  if (currentPending > 0) {
    console.log(`[EXECUTE] Pending proposal #${currentPending} exists — only auto-permitted ops will proceed`);
  }

  // Encode quorum-approved actions
  const proposals = encodeApprovedActions(
    quorum.rebalance, quorum.certify, quorum.issue,
    snapshot, config.contracts.vaultLedger,
  );

  if (proposals.length === 0) {
    console.log("[EXECUTE] No quorum-approved actions to execute");
    return { outcomes: [], pendingProposalId: currentPending, durationMs: Date.now() - t0 };
  }

  console.log(`[EXECUTE] Submitting ${proposals.length} proposal(s) to VaultPolicy...`);

  const outcomes: ProposalOutcome[] = [];
  for (const proposal of proposals) {
    try {
      const outcome = await submitProposal(policy, proposal);
      outcomes.push(outcome);

      // If this proposal went PENDING, stop submitting — only one pending at a time
      if (outcome.status === ProposalStatus.PENDING) {
        console.log("[EXECUTE] Proposal is PENDING — pausing further submissions");
        break;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("pending proposal exists")) {
        console.warn("[EXECUTE] Blocked by existing pending proposal — skipping remaining");
        break;
      }
      console.error(`[EXECUTE] Failed: ${msg}`);
    }
  }

  // Check final pending state
  const finalPending = Number(await policy.pendingProposalId());

  const autoExec = outcomes.filter(o => o.status === ProposalStatus.AUTO_EXECUTED).length;
  const pending = outcomes.filter(o => o.status === ProposalStatus.PENDING).length;
  const elapsed = Date.now() - t0;

  console.log(`[EXECUTE] Done: ${autoExec} auto-executed, ${pending} pending in ${elapsed}ms`);
  console.log("[EXECUTE] ========================================\n");

  return { outcomes, pendingProposalId: finalPending, durationMs: elapsed };
}
