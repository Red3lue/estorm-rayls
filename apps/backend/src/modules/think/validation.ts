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
 * Returns null if the response is not valid JSON or doesn't match the schema.
 */
export function parseAgentResponse(raw: string, agentId: string, perspective: AgentDecision["perspective"]): AgentDecision | null {
  try {
    // Extract JSON from potential markdown fencing
    const jsonStr = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!isObject(parsed)) return null;

    const rebalance = Array.isArray(parsed.rebalance) ? parsed.rebalance.filter(isRebalanceAction) : [];
    const certify = Array.isArray(parsed.certify) ? parsed.certify.filter(isCertifyDecision) : [];
    const issue = Array.isArray(parsed.issue) ? parsed.issue.filter(isIssueDecision) : [];
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";

    return { agentId, perspective, rebalance, certify, issue, reasoning };
  } catch {
    return null;
  }
}
