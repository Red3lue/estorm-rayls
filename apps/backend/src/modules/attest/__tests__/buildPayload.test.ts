import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { buildAttestationPayloads } from "../buildPayload.js";
import { DecisionType, DecisionOrigin } from "../../../types/attest.js";
import { CertificationStatus } from "../../../types/vault.js";
import type { VaultSnapshot } from "../../../types/vault.js";
import type { QuorumResult, AgentDecision, RebalanceAction, CertifyDecision, IssueDecision } from "../../../types/think.js";

const SNAPSHOT: VaultSnapshot = {
  timestamp: 1711656000,
  nav: 2_300_000,
  totalValue: 2_950_000,
  portfolioRiskScore: 24.35,
  portfolioYield: 5.26,
  liquidityRatio: 0.2174,
  fungibles: [
    { address: "0xBOND", symbol: "BOND-GOV-6M", name: "Bond", balance: ethers.parseUnits("1000000", 18), decimals: 18, allocationPct: 38, yieldRate: 4.2, riskScore: 15, value: 1_000_000 },
    { address: "0xACME", symbol: "RECV-ACME-90D", name: "Acme", balance: ethers.parseUnits("500000", 18), decimals: 18, allocationPct: 22, yieldRate: 11, riskScore: 55, value: 500_000 },
    { address: "0xUSDR", symbol: "STABLE-USDr", name: "USDr", balance: ethers.parseUnits("500000", 18), decimals: 18, allocationPct: 22, yieldRate: 0, riskScore: 0, value: 500_000 },
  ],
  nonFungibles: [
    { address: "0xPIC", symbol: "ART-PICASSO-01", name: "Picasso", tokenId: 1n, valuation: 500_000, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 30, receiptTokenIssued: false },
  ],
};

function makeQuorum(overrides: Partial<QuorumResult> = {}): QuorumResult {
  return {
    rebalance: [],
    certify: [],
    issue: [],
    rawDecisions: [{ agentId: "a", perspective: "risk", rebalance: [], certify: [], issue: [], reasoning: "test" }],
    quorumThreshold: 3,
    totalAgents: 4,
    ...overrides,
  };
}

describe("buildAttestationPayloads", () => {
  it("returns empty array when no actions are approved", () => {
    const quorum = makeQuorum({
      rebalance: [{ action: { type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "risk" }, approvedBy: ["a", "b"], rejectedBy: ["c", "d"], approved: false }],
    });
    expect(buildAttestationPayloads(quorum, SNAPSHOT)).toHaveLength(0);
  });

  it("builds rebalance attestation for approved swap", () => {
    const quorum = makeQuorum({
      rebalance: [{
        action: { type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "Reduce risk" },
        approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
      }],
    });
    const payloads = buildAttestationPayloads(quorum, SNAPSHOT);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].token).toBe("0xACME");
    expect(payloads[0].decisionType).toBe(DecisionType.REBALANCE);
    expect(payloads[0].decisionOrigin).toBe(DecisionOrigin.AI_QUORUM);
    expect(payloads[0].quorumVotes).toBe(3);
    expect(payloads[0].quorumTotal).toBe(4);
    expect(payloads[0].score).toBe(75); // 3/4 = 75%
    expect(payloads[0].nav).toBe(230_000_000); // cents
    expect(payloads[0].reason).toContain("REBALANCE");
    expect(payloads[0].reason).toContain("RECV-ACME-90D");
    expect(JSON.parse(payloads[0].portfolioBreakdown)).toHaveLength(3);
  });

  it("builds certification attestation for approved NFT", () => {
    const quorum = makeQuorum({
      certify: [{
        action: { nftSymbol: "ART-PICASSO-01", approved: true, provenanceAssessment: "Verified", qualityScore: 85, riskRating: 25, reason: "Strong provenance" },
        approvedBy: ["a", "b", "c", "d"], rejectedBy: [], approved: true,
      }],
    });
    const payloads = buildAttestationPayloads(quorum, SNAPSHOT);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].token).toBe("0xPIC");
    expect(payloads[0].decisionType).toBe(DecisionType.CERTIFICATION);
    expect(payloads[0].score).toBe(100); // 4/4
    expect(payloads[0].approved).toBe(true);
    expect(payloads[0].reason).toContain("CERTIFICATION");
    expect(payloads[0].reason).toContain("Verified");
  });

  it("builds issuance attestation", () => {
    const quorum = makeQuorum({
      issue: [{
        action: { action: "update_nav", asset: "BOND-GOV-6M", reason: "NAV changed" },
        approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
      }],
    });
    const payloads = buildAttestationPayloads(quorum, SNAPSHOT);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].token).toBe("0xBOND");
    expect(payloads[0].decisionType).toBe(DecisionType.ISSUANCE);
  });

  it("handles mixed approved and rejected across all types", () => {
    const quorum = makeQuorum({
      rebalance: [
        { action: { type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "ok" }, approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true },
        { action: { type: "swap", fromAsset: "BOND-GOV-6M", toAsset: "STABLE-USDr", amount: 10000, reason: "no" }, approvedBy: ["a"], rejectedBy: ["b", "c", "d"], approved: false },
      ],
      certify: [
        { action: { nftSymbol: "ART-PICASSO-01", approved: true, provenanceAssessment: "Good", qualityScore: 80, riskRating: 20, reason: "ok" }, approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true },
      ],
      issue: [
        { action: { action: "update_nav", asset: "STABLE-USDr", reason: "nav" }, approvedBy: ["a", "b"], rejectedBy: ["c", "d"], approved: false },
      ],
    });
    const payloads = buildAttestationPayloads(quorum, SNAPSHOT);

    expect(payloads).toHaveLength(2); // 1 rebalance + 1 certify (issue rejected)
  });
});
