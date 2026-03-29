import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { CertificationStatus } from "../../../types/vault.js";
import type { VaultSnapshot } from "../../../types/vault.js";
import type { QuorumAction, RebalanceAction, CertifyDecision, IssueDecision } from "../../../types/think.js";
import { AssetCategory } from "../../../types/execute.js";
import { encodeRebalance, encodeCertify, encodeIssue, encodeApprovedActions } from "../encodeAction.js";

const LEDGER = "0x9a48eA8DD2E2e66a444cbb60A128104FFd673A51";

const SNAPSHOT: VaultSnapshot = {
  timestamp: 1711656000, nav: 2_300_000, totalValue: 2_950_000,
  portfolioRiskScore: 24.35, portfolioYield: 5.26, liquidityRatio: 0.2174,
  fungibles: [
    { address: "0x1111111111111111111111111111111111111111", symbol: "BOND-GOV-6M", name: "Bond", balance: ethers.parseUnits("1000000", 18), decimals: 18, allocationPct: 38, yieldRate: 4.2, riskScore: 15, value: 1_000_000 },
    { address: "0x2222222222222222222222222222222222222222", symbol: "RECV-ACME-90D", name: "Acme", balance: ethers.parseUnits("500000", 18), decimals: 18, allocationPct: 22, yieldRate: 11, riskScore: 55, value: 500_000 },
    { address: "0x3333333333333333333333333333333333333333", symbol: "STABLE-USDr", name: "USDr", balance: ethers.parseUnits("500000", 18), decimals: 18, allocationPct: 22, yieldRate: 0, riskScore: 0, value: 500_000 },
  ],
  nonFungibles: [
    { address: "0x4444444444444444444444444444444444444444", symbol: "ART-PICASSO-01", name: "Picasso", tokenId: 1n, valuation: 500_000, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 30, receiptTokenIssued: false },
  ],
};

describe("encodeRebalance", () => {
  it("encodes a swap action with correct target and category", () => {
    const qa: QuorumAction<RebalanceAction> = {
      action: { type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "Reduce risk" },
      approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
    };
    const result = encodeRebalance(qa, SNAPSHOT, LEDGER);

    expect(result.target).toBe(LEDGER);
    expect(result.category).toBe(AssetCategory.RECEIVABLE);
    expect(result.quorumVotes).toBe(3);
    expect(result.callData).toBeTruthy();
    expect(result.callData.startsWith("0x")).toBe(true);
    expect(result.reasoning).toContain("REBALANCE");
    expect(result.reasoning).toContain("RECV-ACME-90D");
  });

  it("maps BOND symbol to BOND category", () => {
    const qa: QuorumAction<RebalanceAction> = {
      action: { type: "swap", fromAsset: "BOND-GOV-6M", toAsset: "STABLE-USDr", amount: 10000, reason: "test" },
      approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
    };
    expect(encodeRebalance(qa, SNAPSHOT, LEDGER).category).toBe(AssetCategory.BOND);
  });
});

describe("encodeCertify", () => {
  it("encodes NFT certification with correct target", () => {
    const qa: QuorumAction<CertifyDecision> = {
      action: { nftSymbol: "ART-PICASSO-01", approved: true, provenanceAssessment: "Verified", qualityScore: 85, riskRating: 25, reason: "Strong" },
      approvedBy: ["a", "b", "c", "d"], rejectedBy: [], approved: true,
    };
    const result = encodeCertify(qa, SNAPSHOT, LEDGER);

    expect(result.target).toBe(LEDGER);
    expect(result.category).toBe(AssetCategory.ART);
    expect(result.quorumVotes).toBe(4);
    expect(result.reasoning).toContain("CERTIFICATION");
    expect(result.reasoning).toContain("APPROVED");
  });
});

describe("encodeIssue", () => {
  it("encodes update_nav as updatePortfolio calldata", () => {
    const qa: QuorumAction<IssueDecision> = {
      action: { action: "update_nav", asset: "VAULT-SHARE", reason: "NAV changed" },
      approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
    };
    const result = encodeIssue(qa, SNAPSHOT, LEDGER);

    expect(result).not.toBeNull();
    expect(result!.target).toBe(LEDGER);
    expect(result!.category).toBe(AssetCategory.NAV_UPDATE);
  });

  it("returns null for mint_receipt (handled by Issue module)", () => {
    const qa: QuorumAction<IssueDecision> = {
      action: { action: "mint_receipt", asset: "ART-PICASSO-01", reason: "Certified" },
      approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true,
    };
    expect(encodeIssue(qa, SNAPSHOT, LEDGER)).toBeNull();
  });
});

describe("encodeApprovedActions", () => {
  it("only encodes approved actions", () => {
    const rebalance: QuorumAction<RebalanceAction>[] = [
      { action: { type: "swap", fromAsset: "RECV-ACME-90D", toAsset: "STABLE-USDr", amount: 50000, reason: "ok" }, approvedBy: ["a", "b", "c"], rejectedBy: ["d"], approved: true },
      { action: { type: "swap", fromAsset: "BOND-GOV-6M", toAsset: "STABLE-USDr", amount: 10000, reason: "no" }, approvedBy: ["a"], rejectedBy: ["b", "c", "d"], approved: false },
    ];
    const result = encodeApprovedActions(rebalance, [], [], SNAPSHOT, LEDGER);
    expect(result).toHaveLength(1);
  });

  it("returns empty for no approved actions", () => {
    expect(encodeApprovedActions([], [], [], SNAPSHOT, LEDGER)).toHaveLength(0);
  });
});
