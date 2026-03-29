import { describe, it, expect } from "vitest";
import { observe } from "../observe.js";

describe("observe() integration — live Privacy Node", () => {
  it("returns a valid VaultSnapshot with real on-chain data", async () => {
    const snapshot = await observe();

    // AC7: callable independently, returns typed object
    expect(snapshot).toBeDefined();
    expect(snapshot.timestamp).toBeGreaterThan(0);

    // AC4: NAV computed (from VaultLedger valueUSD or balanceOf)
    expect(typeof snapshot.nav).toBe("number");
    expect(snapshot.nav).toBeGreaterThanOrEqual(0);

    // AC1: reads all 4 ERC-20 tokens
    expect(Array.isArray(snapshot.fungibles)).toBe(true);
    expect(snapshot.fungibles.length).toBe(4);

    for (const asset of snapshot.fungibles) {
      expect(asset.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(asset.symbol).toBeTruthy();
      expect(typeof asset.value).toBe("number");
    }

    // AC5: structured snapshot with both asset types
    expect(Array.isArray(snapshot.nonFungibles)).toBe(true);
    expect(typeof snapshot.portfolioRiskScore).toBe("number");
    expect(typeof snapshot.portfolioYield).toBe("number");
    expect(typeof snapshot.liquidityRatio).toBe("number");
  }, 15_000);
});
