import { describe, it, expect } from "vitest";
import type { AgentDecision } from "../../../types/think.js";
import { computeQuorum } from "../quorum.js";

function makeDecision(id: string, perspective: AgentDecision["perspective"], overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    agentId: id,
    perspective,
    rebalance: [],
    certify: [],
    issue: [],
    reasoning: "test",
    ...overrides,
  };
}

const SWAP_ACTION = { type: "swap" as const, fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "risk" };
const CERTIFY_ACTION = { nftSymbol: "ART-PICASSO-01", approved: true, provenanceAssessment: "Good", qualityScore: 85, riskRating: 25, reason: "ok" };
const ISSUE_ACTION = { action: "update_nav" as const, asset: "VAULT-SHARE", reason: "nav changed" };

describe("computeQuorum", () => {
  it("approves action when 3/4 agents agree", () => {
    const decisions = [
      makeDecision("a", "risk", { rebalance: [SWAP_ACTION] }),
      makeDecision("b", "yield", { rebalance: [SWAP_ACTION] }),
      makeDecision("c", "compliance", { rebalance: [SWAP_ACTION] }),
      makeDecision("d", "balanced", {}),
    ];
    const result = computeQuorum(decisions);
    expect(result.rebalance).toHaveLength(1);
    expect(result.rebalance[0].approved).toBe(true);
    expect(result.rebalance[0].approvedBy).toEqual(["a", "b", "c"]);
    expect(result.rebalance[0].rejectedBy).toEqual(["d"]);
  });

  it("rejects action when only 2/4 agents agree", () => {
    const decisions = [
      makeDecision("a", "risk", { rebalance: [SWAP_ACTION] }),
      makeDecision("b", "yield", { rebalance: [SWAP_ACTION] }),
      makeDecision("c", "compliance", {}),
      makeDecision("d", "balanced", {}),
    ];
    const result = computeQuorum(decisions);
    expect(result.rebalance).toHaveLength(1);
    expect(result.rebalance[0].approved).toBe(false);
    expect(result.rebalance[0].approvedBy).toHaveLength(2);
  });

  it("approves when all 4 agents agree", () => {
    const decisions = [
      makeDecision("a", "risk", { certify: [CERTIFY_ACTION] }),
      makeDecision("b", "yield", { certify: [CERTIFY_ACTION] }),
      makeDecision("c", "compliance", { certify: [CERTIFY_ACTION] }),
      makeDecision("d", "balanced", { certify: [CERTIFY_ACTION] }),
    ];
    const result = computeQuorum(decisions);
    expect(result.certify).toHaveLength(1);
    expect(result.certify[0].approved).toBe(true);
    expect(result.certify[0].approvedBy).toHaveLength(4);
    expect(result.certify[0].rejectedBy).toHaveLength(0);
  });

  it("handles multiple different actions independently", () => {
    const swap2 = { ...SWAP_ACTION, fromAsset: "BOND-GOV-6M", reason: "yield" };
    const decisions = [
      makeDecision("a", "risk", { rebalance: [SWAP_ACTION] }),
      makeDecision("b", "yield", { rebalance: [SWAP_ACTION, swap2] }),
      makeDecision("c", "compliance", { rebalance: [SWAP_ACTION] }),
      makeDecision("d", "balanced", { rebalance: [swap2] }),
    ];
    const result = computeQuorum(decisions);
    expect(result.rebalance).toHaveLength(2);
    const acmeSwap = result.rebalance.find(r => r.action.fromAsset === "RECV-ACME-90D");
    const bondSwap = result.rebalance.find(r => r.action.fromAsset === "BOND-GOV-6M");
    expect(acmeSwap!.approved).toBe(true);  // 3 votes
    expect(bondSwap!.approved).toBe(false);  // 2 votes
  });

  it("handles all three decision types in one quorum", () => {
    const decisions = [
      makeDecision("a", "risk", { rebalance: [SWAP_ACTION], certify: [CERTIFY_ACTION], issue: [ISSUE_ACTION] }),
      makeDecision("b", "yield", { rebalance: [SWAP_ACTION], certify: [CERTIFY_ACTION], issue: [ISSUE_ACTION] }),
      makeDecision("c", "compliance", { rebalance: [SWAP_ACTION], certify: [CERTIFY_ACTION], issue: [ISSUE_ACTION] }),
      makeDecision("d", "balanced", {}),
    ];
    const result = computeQuorum(decisions);
    expect(result.rebalance[0].approved).toBe(true);
    expect(result.certify[0].approved).toBe(true);
    expect(result.issue[0].approved).toBe(true);
  });

  it("returns empty arrays when no agents propose actions", () => {
    const decisions = [
      makeDecision("a", "risk", {}),
      makeDecision("b", "yield", {}),
      makeDecision("c", "compliance", {}),
      makeDecision("d", "balanced", {}),
    ];
    const result = computeQuorum(decisions);
    expect(result.rebalance).toHaveLength(0);
    expect(result.certify).toHaveLength(0);
    expect(result.issue).toHaveLength(0);
  });

  it("preserves raw decisions in result", () => {
    const decisions = [makeDecision("a", "risk"), makeDecision("b", "yield")];
    const result = computeQuorum(decisions);
    expect(result.rawDecisions).toHaveLength(2);
    expect(result.quorumThreshold).toBe(3);
    expect(result.totalAgents).toBe(4);
  });
});
