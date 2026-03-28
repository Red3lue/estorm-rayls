import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { CertificationStatus } from "../../../types/vault.js";
import type { FungibleAsset, NonFungibleAsset } from "../../../types/vault.js";
import {
  computeNav, computePortfolioMetrics, buildFungibleAsset, buildNonFungibleAsset,
  buildSnapshot, mapCertificationStatus, type RawErc20Read, type RawErc721Read,
} from "../computation.js";

function makeFungible(overrides: Partial<FungibleAsset> = {}): FungibleAsset {
  return { address: "0x1111", symbol: "BOND-GOV-6M", name: "Gov Bond", balance: ethers.parseUnits("300000", 18), decimals: 18, allocationPct: 30, yieldRate: 4.2, riskScore: 15, value: 300_000, ...overrides };
}
function makeStable(value: number): FungibleAsset {
  return makeFungible({ address: "0x4444", symbol: "STABLE-USDr", name: "USDr", balance: ethers.parseUnits(value.toString(), 18), allocationPct: 25, yieldRate: 0, riskScore: 0, value });
}
function makeNft(overrides: Partial<NonFungibleAsset> = {}): NonFungibleAsset {
  return { address: "0xaaaa", symbol: "ART-PICASSO-01", name: "Picasso", tokenId: 1n, valuation: 500_000, certificationStatus: CertificationStatus.UNCERTIFIED, riskScore: 30, receiptTokenIssued: false, ...overrides };
}

describe("computeNav", () => {
  it("sums all fungible values", () => {
    expect(computeNav([makeFungible({ value: 300_000 }), makeFungible({ value: 200_000 }), makeStable(250_000)])).toBe(750_000);
  });
  it("returns 0 for empty", () => { expect(computeNav([])).toBe(0); });
});

describe("computePortfolioMetrics", () => {
  it("computes weighted risk, yield, liquidity", () => {
    const assets = [makeFungible({ value: 300_000, riskScore: 15, yieldRate: 4.2 }), makeFungible({ value: 250_000, riskScore: 45, yieldRate: 11, symbol: "RECV-ACME-90D" }), makeFungible({ value: 200_000, riskScore: 35, yieldRate: 8, symbol: "RECV-BETA-30D" }), makeStable(250_000)];
    const r = computePortfolioMetrics(assets, 1_000_000);
    expect(r.portfolioRiskScore).toBe(22.75);
    expect(r.portfolioYield).toBe(5.61);
    expect(r.liquidityRatio).toBe(0.25);
  });
  it("returns zeros for nav=0", () => {
    const r = computePortfolioMetrics([], 0);
    expect(r.portfolioRiskScore).toBe(0);
    expect(r.liquidityRatio).toBe(0);
  });
  it("100% stablecoin = liquidity 1.0", () => {
    const r = computePortfolioMetrics([makeStable(500_000)], 500_000);
    expect(r.liquidityRatio).toBe(1);
    expect(r.portfolioRiskScore).toBe(0);
  });
});

describe("buildFungibleAsset", () => {
  it("uses ledger meta when provided", () => {
    const raw: RawErc20Read = { address: "0x1", symbol: "BOND-GOV-6M", name: "Bond", balance: ethers.parseUnits("500000", 18), decimals: 18 };
    const r = buildFungibleAsset(raw, { allocationPct: 40, riskScore: 10, yieldRate: 5.5 });
    expect(r.allocationPct).toBe(40);
    expect(r.value).toBe(500_000);
  });
  it("falls back to defaults for known symbols", () => {
    const r = buildFungibleAsset({ address: "0x1", symbol: "RECV-ACME-90D", name: "Acme", balance: 100n, decimals: 18 }, undefined);
    expect(r.allocationPct).toBe(25);
    expect(r.riskScore).toBe(45);
  });
  it("handles 6-decimal tokens", () => {
    const r = buildFungibleAsset({ address: "0x1", symbol: "STABLE-USDr", name: "USDr", balance: 5_000_000n * 10n ** 6n, decimals: 6 }, undefined);
    expect(r.value).toBe(5_000_000);
  });
});

describe("buildNonFungibleAsset", () => {
  it("uses ledger meta when provided", () => {
    const r = buildNonFungibleAsset({ address: "0xa", symbol: "ART-PICASSO-01", name: "P", tokenId: 1n, owned: true }, { valuation: 750_000, certificationStatus: CertificationStatus.CERTIFIED, riskScore: 20 });
    expect(r.valuation).toBe(750_000);
    expect(r.certificationStatus).toBe(CertificationStatus.CERTIFIED);
  });
  it("falls back to defaults", () => {
    const r = buildNonFungibleAsset({ address: "0xa", symbol: "ART-WARHOL-01", name: "W", tokenId: 1n, owned: true }, undefined);
    expect(r.valuation).toBe(150_000);
  });
});

describe("mapCertificationStatus", () => {
  it("maps known values", () => {
    expect(mapCertificationStatus(0)).toBe(CertificationStatus.UNCERTIFIED);
    expect(mapCertificationStatus(1)).toBe(CertificationStatus.CERTIFIED);
    expect(mapCertificationStatus(2)).toBe(CertificationStatus.REJECTED);
  });
  it("defaults unknown to UNCERTIFIED", () => { expect(mapCertificationStatus(99)).toBe(CertificationStatus.UNCERTIFIED); });
});

describe("buildSnapshot", () => {
  it("assembles complete snapshot", () => {
    const s = buildSnapshot([makeFungible({ value: 600_000 }), makeStable(400_000)], [makeNft(), makeNft({ valuation: 150_000, symbol: "ART-WARHOL-01" })]);
    expect(s.nav).toBe(1_000_000);
    expect(s.totalValue).toBe(1_650_000);
    expect(s.liquidityRatio).toBe(0.4);
    expect(s.fungibles).toHaveLength(2);
    expect(s.nonFungibles).toHaveLength(2);
  });
  it("handles empty vault", () => {
    const s = buildSnapshot([], []);
    expect(s.nav).toBe(0);
    expect(s.totalValue).toBe(0);
  });
});
