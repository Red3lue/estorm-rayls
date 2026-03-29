import type {
  AgentDecision, QuorumResult, QuorumAction,
  RebalanceAction, CertifyDecision, IssueDecision,
} from "../../types/think.js";
import { config } from "../../config/index.js";

const QUORUM_THRESHOLD = config.agent.quorumThreshold;
const TOTAL_AGENTS = config.agent.totalAgents;

/**
 * Generates a stable key for comparing equivalent actions across agents.
 */
function rebalanceKey(a: RebalanceAction): string {
  return `${a.type}:${a.fromAsset}:${a.toAsset}`;
}

function certifyKey(a: CertifyDecision): string {
  return `${a.nftSymbol}:${a.approved}`;
}

function issueKey(a: IssueDecision): string {
  return `${a.action}:${a.asset}`;
}

/**
 * Generic quorum check: group actions by key, count votes, apply threshold.
 */
function applyQuorum<T>(
  decisions: AgentDecision[],
  extract: (d: AgentDecision) => T[],
  keyFn: (a: T) => string,
): QuorumAction<T>[] {
  const actionMap = new Map<string, { action: T; approvedBy: string[]; rejectedBy: string[] }>();
  const allAgentIds = decisions.map(d => d.agentId);

  for (const decision of decisions) {
    for (const action of extract(decision)) {
      const key = keyFn(action);
      if (!actionMap.has(key)) {
        actionMap.set(key, { action, approvedBy: [], rejectedBy: [] });
      }
      actionMap.get(key)!.approvedBy.push(decision.agentId);
    }
  }

  // Agents that didn't propose an action count as rejections
  for (const [, entry] of actionMap) {
    entry.rejectedBy = allAgentIds.filter(id => !entry.approvedBy.includes(id));
  }

  return Array.from(actionMap.values()).map(({ action, approvedBy, rejectedBy }) => ({
    action,
    approvedBy,
    rejectedBy,
    approved: approvedBy.length >= QUORUM_THRESHOLD,
  }));
}

/**
 * Applies the 3/4 quorum rule across all agent decisions.
 * An action is approved only if 3 out of 4 agents proposed it.
 *
 * Returns at most ONE approved action (the highest-voted one).
 * This ensures the protocol processes exactly one decision per cycle,
 * so ATTEST and ISSUE are only triggered when that single action succeeds on-chain.
 */
export function computeQuorum(decisions: AgentDecision[]): QuorumResult {
  const allRebalance = applyQuorum(decisions, d => d.rebalance, rebalanceKey);
  const allCertify = applyQuorum(decisions, d => d.certify, certifyKey);
  const allIssue = applyQuorum(decisions, d => d.issue, issueKey);

  const all = [
    ...allRebalance.map(a => ({ ...a, _src: "rebalance" as const })),
    ...allCertify.map(a => ({ ...a, _src: "certify" as const })),
    ...allIssue.map(a => ({ ...a, _src: "issue" as const })),
  ];

  for (const a of all) {
    const status = a.approved ? "APPROVED" : "REJECTED";
    const key = "type" in a.action ? `${(a.action as RebalanceAction).type}` : "action" in a.action ? `${(a.action as IssueDecision).action}` : "certify";
    console.log(`[THINK]   ${status} [${a.approvedBy.length}/${TOTAL_AGENTS}] ${key}: ${a.approvedBy.join(", ")} | rejected: ${a.rejectedBy.join(", ") || "none"}`);
  }

  // Pick the single highest-voted approved action
  const winner = all
    .filter(a => a.approved)
    .sort((a, b) => b.approvedBy.length - a.approvedBy.length)[0] ?? null;

  const rebalance: QuorumAction<RebalanceAction>[] = [];
  const certify: QuorumAction<CertifyDecision>[] = [];
  const issue: QuorumAction<IssueDecision>[] = [];

  if (winner) {
    if (winner._src === "rebalance") rebalance.push(winner as unknown as QuorumAction<RebalanceAction>);
    else if (winner._src === "certify") certify.push(winner as unknown as QuorumAction<CertifyDecision>);
    else if (winner._src === "issue") issue.push(winner as unknown as QuorumAction<IssueDecision>);
    console.log(`[THINK] Quorum: selected 1 action (${winner._src}) with ${winner.approvedBy.length}/${TOTAL_AGENTS} votes`);
  } else {
    console.log(`[THINK] Quorum: no action reached threshold (${QUORUM_THRESHOLD}/${TOTAL_AGENTS})`);
  }

  return {
    rebalance,
    certify,
    issue,
    rawDecisions: decisions,
    quorumThreshold: QUORUM_THRESHOLD,
    totalAgents: TOTAL_AGENTS,
  };
}
