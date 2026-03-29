import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getAgentWallet } from "../../clients/privacyNode.js";
import { VAULT_LEDGER_ABI } from "../../abis/index.js";
import type { ShockEvent, ShockResult } from "../../types/shock.js";

const UPDATE_PORTFOLIO_ABI = [
  "function updatePortfolio(address[] tokenAddresses, uint8[] riskScores, uint256[] yieldBps) external",
];

function resolveAddress(symbol: string): string {
  const map: Record<string, string> = {
    "BOND-GOV-6M": config.contracts.bondGov,
    "RECV-ACME-90D": config.contracts.recvAcme,
    "RECV-BETA-30D": config.contracts.recvBeta,
    "STABLE-USDr": config.contracts.stableUsdr,
  };
  return map[symbol] ?? "";
}

/**
 * Injects a market shock by updating asset metadata on VaultLedger.
 *
 * For the hackathon demo, this calls VaultLedger.updatePortfolio() directly.
 * The agent's next OBSERVE cycle will read the updated risk scores and
 * the THINK module will react accordingly (rebalance, delist, etc.).
 *
 * In production, this would go through VaultPolicy.propose() or be triggered
 * by an external oracle feed.
 */
export async function injectShock(event: ShockEvent): Promise<ShockResult> {
  console.log(`\n[SHOCK] ========================================`);
  console.log(`[SHOCK] Injecting: ${event.asset} risk → ${event.newRiskScore}/100`);
  console.log(`[SHOCK] Reason: ${event.reason}`);

  if (!config.contracts.vaultLedger) {
    throw new Error("VAULT_LEDGER_ADDRESS not configured");
  }

  const address = resolveAddress(event.asset);
  if (!address) {
    throw new Error(`Unknown asset symbol: ${event.asset}`);
  }

  const wallet = getAgentWallet();
  const ledger = new ethers.Contract(config.contracts.vaultLedger, [...VAULT_LEDGER_ABI, ...UPDATE_PORTFOLIO_ABI], wallet);

  // Read current state to get previous risk score
  const [erc20Assets] = await ledger.getVaultSnapshot();
  const current = erc20Assets.find((a: { tokenAddress: string }) => a.tokenAddress.toLowerCase() === address.toLowerCase());
  const previousRisk = current ? Number(current.riskScore) : 0;
  const currentYieldBps = current ? Number(current.yieldBps) : 0;

  // Apply shock: update only the affected asset
  const tx = await ledger.updatePortfolio(
    [address],
    [event.newRiskScore],
    [event.newYieldBps ?? currentYieldBps],
  );
  const receipt = await tx.wait();

  console.log(`[SHOCK] Applied: ${event.asset} risk ${previousRisk} → ${event.newRiskScore}`);
  console.log(`[SHOCK] Tx: ${tx.hash} (block ${receipt.blockNumber})`);
  console.log(`[SHOCK] Agent will detect this in next OBSERVE cycle`);
  console.log(`[SHOCK] ========================================\n`);

  return {
    asset: event.asset,
    previousRiskScore: previousRisk,
    newRiskScore: event.newRiskScore,
    txHash: tx.hash,
    appliedAt: Math.floor(Date.now() / 1000),
  };
}
