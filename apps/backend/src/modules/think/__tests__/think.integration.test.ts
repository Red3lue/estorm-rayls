import { describe, it, expect } from "vitest";
import { observe } from "../../observe/index.js";
import { think, DefaultStrategy } from "../index.js";
import { ClaudeCodeAdapter } from "../../../adapters/claudeCode.js";

describe("think() integration — live Claude Code CLI + real vault", () => {
  it("spawns 4 agents, collects decisions, applies quorum", async () => {
    const snapshot = await observe();
    const strategy = new DefaultStrategy();
    const llm = new ClaudeCodeAdapter();

    const result = await think(snapshot, strategy, llm);

    expect(result).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.quorum).toBeDefined();
    expect(result.quorum.rawDecisions.length).toBeGreaterThanOrEqual(1);
    expect(result.quorum.quorumThreshold).toBe(3);
    expect(result.quorum.totalAgents).toBe(4);

    // Each valid decision should have the right structure
    for (const d of result.quorum.rawDecisions) {
      expect(d.agentId).toBeTruthy();
      expect(["risk", "yield", "compliance", "balanced"]).toContain(d.perspective);
      expect(Array.isArray(d.rebalance)).toBe(true);
      expect(Array.isArray(d.certify)).toBe(true);
      expect(Array.isArray(d.issue)).toBe(true);
    }

    // Quorum actions should have approvedBy/rejectedBy
    for (const a of [...result.quorum.rebalance, ...result.quorum.certify, ...result.quorum.issue]) {
      expect(Array.isArray(a.approvedBy)).toBe(true);
      expect(Array.isArray(a.rejectedBy)).toBe(true);
      expect(typeof a.approved).toBe("boolean");
    }
  }, 300_000); // 5 min timeout — 4 LLM calls in parallel
});
