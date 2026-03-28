import { describe, it, expect } from "vitest";
import { parseAgentResponse } from "../validation.js";

const VALID_JSON = JSON.stringify({
  rebalance: [{ type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "Reduce risk exposure" }],
  certify: [{ nftSymbol: "ART-PICASSO-01", approved: true, provenanceAssessment: "Verified auction history", qualityScore: 85, riskRating: 25, reason: "Strong provenance" }],
  issue: [{ action: "update_nav", asset: "VAULT-SHARE", reason: "NAV changed after rebalance" }],
  reasoning: "Portfolio is overexposed to receivables",
});

describe("parseAgentResponse", () => {
  it("parses valid JSON into AgentDecision", () => {
    const result = parseAgentResponse(VALID_JSON, "agent-risk", "risk");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("agent-risk");
    expect(result!.perspective).toBe("risk");
    expect(result!.rebalance).toHaveLength(1);
    expect(result!.rebalance[0].type).toBe("swap");
    expect(result!.certify).toHaveLength(1);
    expect(result!.certify[0].approved).toBe(true);
    expect(result!.issue).toHaveLength(1);
    expect(result!.reasoning).toBe("Portfolio is overexposed to receivables");
  });

  it("handles markdown-fenced JSON", () => {
    const fenced = "```json\n" + VALID_JSON + "\n```";
    const result = parseAgentResponse(fenced, "agent-yield", "yield");
    expect(result).not.toBeNull();
    expect(result!.rebalance).toHaveLength(1);
  });

  it("returns null for invalid JSON", () => {
    expect(parseAgentResponse("not json at all", "a", "risk")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseAgentResponse('"just a string"', "a", "risk")).toBeNull();
  });

  it("filters out invalid actions but keeps valid ones", () => {
    const mixed = JSON.stringify({
      rebalance: [
        { type: "swap", fromAsset: "A", toAsset: "B", amount: 100, reason: "ok" },
        { type: "invalid_type", fromAsset: "A", toAsset: "B", amount: 100, reason: "bad" },
        { missing: "fields" },
      ],
      certify: [],
      issue: [],
      reasoning: "test",
    });
    const result = parseAgentResponse(mixed, "a", "balanced");
    expect(result).not.toBeNull();
    expect(result!.rebalance).toHaveLength(1);
    expect(result!.rebalance[0].type).toBe("swap");
  });

  it("handles empty arrays gracefully", () => {
    const empty = JSON.stringify({ rebalance: [], certify: [], issue: [], reasoning: "No actions needed" });
    const result = parseAgentResponse(empty, "a", "compliance");
    expect(result).not.toBeNull();
    expect(result!.rebalance).toHaveLength(0);
    expect(result!.certify).toHaveLength(0);
    expect(result!.issue).toHaveLength(0);
  });
});
