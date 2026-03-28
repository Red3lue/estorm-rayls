import type {
  AgentDecision, QuorumResult, QuorumAction,
  RebalanceAction, CertifyDecision, IssueDecision,
} from "../../types/think.js";

const QUORUM_THRESHOLD = 3;
const TOTAL_AGENTS = 4;

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
 */
export function computeQuorum(decisions: AgentDecision[]): QuorumResult {
  const rebalance = applyQuorum(decisions, d => d.rebalance, rebalanceKey);
  const certify = applyQuorum(decisions, d => d.certify, certifyKey);
  const issue = applyQuorum(decisions, d => d.issue, issueKey);

  const approvedCount = [...rebalance, ...certify, ...issue].filter(a => a.approved).length;
  const rejectedCount = [...rebalance, ...certify, ...issue].filter(a => !a.approved).length;

  console.log(`[THINK] Quorum: ${approvedCount} actions approved, ${rejectedCount} discarded (threshold: ${QUORUM_THRESHOLD}/${TOTAL_AGENTS})`);

  for (const a of [...rebalance, ...certify, ...issue]) {
    const status = a.approved ? "APPROVED" : "REJECTED";
    const key = "type" in a.action ? `${(a.action as RebalanceAction).type}` : "action" in a.action ? `${(a.action as IssueDecision).action}` : "certify";
    console.log(`[THINK]   ${status} [${a.approvedBy.length}/${TOTAL_AGENTS}] ${key}: ${a.approvedBy.join(", ")} | rejected: ${a.rejectedBy.join(", ") || "none"}`);
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
