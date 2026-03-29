import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getAgentWallet } from "../../clients/privacyNode.js";
import type { OpportunityEvent, OpportunityResult } from "../../types/opportunity.js";

const ADD_ERC20_ABI = [
  "function addERC20Asset(address tokenAddress, string symbol, uint8 riskScore, uint256 yieldBps) external",
];

const ADD_ERC721_ABI = [
  "function addERC721Asset(address tokenAddress, uint256 tokenId, string symbol, uint256 valuationUSD, uint8 riskScore) external",
];

/**
 * Injects a new asset opportunity by registering it on VaultLedger.
 *
 * For ERC-20: calls VaultLedger.addERC20Asset() — tokens must already be
 * held by VaultLedger (transferred before this call).
 *
 * For ERC-721: calls VaultLedger.addERC721Asset() — registers the NFT
 * so the agent's next OBSERVE cycle detects it and THINK evaluates it.
 */
export async function injectOpportunity(event: OpportunityEvent): Promise<OpportunityResult> {
  console.log(`\n[OPPORTUNITY] ========================================`);
  console.log(`[OPPORTUNITY] New ${event.type}: ${event.symbol} at ${event.tokenAddress}`);
  console.log(`[OPPORTUNITY] Reason: ${event.reason}`);

  if (!config.contracts.vaultLedger) {
    throw new Error("VAULT_LEDGER_ADDRESS not configured");
  }

  const wallet = getAgentWallet();
  let tx: ethers.TransactionResponse;

  if (event.type === "erc20") {
    const ledger = new ethers.Contract(config.contracts.vaultLedger, ADD_ERC20_ABI, wallet);
    tx = await ledger.addERC20Asset(
      event.tokenAddress,
      event.symbol,
      event.riskScore,
      event.yieldBps ?? 0,
    );
  } else {
    const ledger = new ethers.Contract(config.contracts.vaultLedger, ADD_ERC721_ABI, wallet);
    tx = await ledger.addERC721Asset(
      event.tokenAddress,
      event.tokenId ?? 1,
      event.symbol,
      event.valuationUSD ?? 0,
      event.riskScore,
    );
  }

  const receipt = await tx.wait();

  console.log(`[OPPORTUNITY] Registered on VaultLedger — tx: ${tx.hash}`);
  console.log(`[OPPORTUNITY] Agent will detect this in next OBSERVE cycle`);
  console.log(`[OPPORTUNITY] ========================================\n`);

  return {
    type: event.type,
    symbol: event.symbol,
    tokenAddress: event.tokenAddress,
    txHash: tx.hash,
    registeredAt: Math.floor(Date.now() / 1000),
  };
}
