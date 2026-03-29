import type { AgentDecision, RebalanceAction, CertifyDecision, IssueDecision } from "../../types/think.js";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isRebalanceAction(v: unknown): v is RebalanceAction {
  if (!isObject(v)) return false;
  return (
    ["swap", "mint", "burn"].includes(v.type as string) &&
    typeof v.fromAsset === "string" &&
    typeof v.toAsset === "string" &&
    typeof v.amount === "number" &&
    typeof v.reason === "string"
  );
}

function isCertifyDecision(v: unknown): v is CertifyDecision {
  if (!isObject(v)) return false;
  return (
    typeof v.nftSymbol === "string" &&
    typeof v.approved === "boolean" &&
    typeof v.provenanceAssessment === "string" &&
    typeof v.qualityScore === "number" &&
    typeof v.riskRating === "number" &&
    typeof v.reason === "string"
  );
}

function isIssueDecision(v: unknown): v is IssueDecision {
  if (!isObject(v)) return false;
  return (
    ["update_nav", "mint_receipt", "list", "delist"].includes(v.action as string) &&
    typeof v.asset === "string" &&
    typeof v.reason === "string"
  );
}

/**
 * Parses raw LLM output into a validated AgentDecision.
 * Accepts both single-action format (actionType + fields) and legacy array format.
 * Returns null if the response is not valid JSON or doesn't match the schema.
 */
export function parseAgentResponse(raw: string, agentId: string, perspective: AgentDecision["perspective"]): AgentDecision | null {
  try {
    // Extract JSON from potential markdown fencing
    const jsonStr = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!isObject(parsed)) return null;

    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";

    // Single-action format: { actionType, rebalance: obj|null, certify: obj|null, issue: obj|null }
    if (typeof parsed.actionType === "string") {
      const rebalance: RebalanceAction[] = [];
      const certify: CertifyDecision[] = [];
      const issue: IssueDecision[] = [];

      if (parsed.actionType === "rebalance" && isRebalanceAction(parsed.rebalance)) {
        rebalance.push(parsed.rebalance);
      } else if (parsed.actionType === "certify" && isCertifyDecision(parsed.certify)) {
        certify.push(parsed.certify);
      } else if (parsed.actionType === "issue" && isIssueDecision(parsed.issue)) {
        issue.push(parsed.issue);
      }
      // actionType === "none" → all empty arrays

      return { agentId, perspective, rebalance, certify, issue, reasoning };
    }

    // Legacy array format fallback — take only the first valid action across all categories
    const rebalanceAll = Array.isArray(parsed.rebalance) ? parsed.rebalance.filter(isRebalanceAction) : [];
    const certifyAll = Array.isArray(parsed.certify) ? parsed.certify.filter(isCertifyDecision) : [];
    const issueAll = Array.isArray(parsed.issue) ? parsed.issue.filter(isIssueDecision) : [];

    // Pick only the first action found (priority: rebalance > certify > issue)
    if (rebalanceAll.length > 0) {
      return { agentId, perspective, rebalance: [rebalanceAll[0]], certify: [], issue: [], reasoning };
    }
    if (certifyAll.length > 0) {
      return { agentId, perspective, rebalance: [], certify: [certifyAll[0]], issue: [], reasoning };
    }
    if (issueAll.length > 0) {
      return { agentId, perspective, rebalance: [], certify: [], issue: [issueAll[0]], reasoning };
    }

    return { agentId, perspective, rebalance: [], certify: [], issue: [], reasoning };
  } catch {
    return null;
  }
}
