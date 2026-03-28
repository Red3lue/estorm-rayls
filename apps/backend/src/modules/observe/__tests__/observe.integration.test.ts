import { describe, it, expect } from "vitest";
import { observe } from "../observe.js";

describe("observe() integration — live Privacy Node", () => {
  it("returns a valid VaultSnapshot with real ERC-20 balances", async () => {
    const snapshot = await observe();

    expect(snapshot).toBeDefined();
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(typeof snapshot.nav).toBe("number");
    expect(snapshot.nav).toBeGreaterThan(0); // Real tokens deployed with initial supply
    expect(Array.isArray(snapshot.fungibles)).toBe(true);
    expect(snapshot.fungibles.length).toBe(4); // 4 ERC-20 tokens deployed

    for (const asset of snapshot.fungibles) {
      expect(asset.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(asset.balance).toBeGreaterThan(0n);
      expect(asset.value).toBeGreaterThan(0);
      expect(asset.symbol).toBeTruthy();
    }

    expect(Array.isArray(snapshot.nonFungibles)).toBe(true);
    expect(typeof snapshot.portfolioRiskScore).toBe("number");
    expect(typeof snapshot.portfolioYield).toBe("number");
    expect(typeof snapshot.liquidityRatio).toBe("number");
  }, 15_000);
});
