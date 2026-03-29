import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getPublicChainProvider, getAttestationWriterWallet } from "../../clients/publicChain.js";
import { getPrivacyNodeProvider, getAgentWallet } from "../../clients/privacyNode.js";
import { PUBLIC_CHAIN_MIRROR_ABI, RAYLS_ERC20_HANDLER_ABI } from "../../abis/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeleportResult {
  txHash: string;
  amount: bigint;
  direction: "public-to-private" | "private-to-public";
  token: string;
}

// ─── Public → Privacy (Inbound Capital) ──────────────────────────────────────

/**
 * Bridge tokens from Public Chain → Privacy Node.
 *
 * Flow:
 *   1. Agent holds tokens on Public Chain (e.g. received from VaultShareToken.buy())
 *   2. Agent calls `teleportToPrivacyNode()` on the mirror contract
 *   3. Mirror burns tokens, relayer unlocks on Privacy Node
 *   4. Agent detects new capital in next OBSERVE cycle
 *
 * NOTE: `teleportToPrivacyNode()` on the auto-deployed PublicChainERC20 mirror
 *       burns the caller's entire balance. To teleport a specific amount, first
 *       transfer the exact amount to a temp address, then call teleport from there.
 *       For the hackathon demo, we teleport the full balance.
 *
 * @param mirrorAddress  Address of the PublicChainERC20 mirror on Public Chain
 */
export async function teleportToPrivacyNode(
  mirrorAddress: string,
): Promise<TeleportResult> {
  const wallet = getAttestationWriterWallet();
  const mirror = new ethers.Contract(mirrorAddress, PUBLIC_CHAIN_MIRROR_ABI, wallet);

  const balance: bigint = await mirror.balanceOf(wallet.address);
  if (balance === 0n) {
    throw new Error(`No balance to teleport on mirror ${mirrorAddress}`);
  }

  console.log(`[TELEPORT] Public → Privacy: ${ethers.formatEther(balance)} tokens`);
  console.log(`[TELEPORT] Mirror: ${mirrorAddress}`);
  console.log(`[TELEPORT] From: ${wallet.address}`);

  const tx = await mirror.teleportToPrivacyNode({ gasLimit: 500_000 });
  const receipt = await tx.wait();

  console.log(`[TELEPORT] Confirmed: ${tx.hash} (block ${receipt.blockNumber})`);

  return {
    txHash: tx.hash,
    amount: balance,
    direction: "public-to-private",
    token: mirrorAddress,
  };
}

// ─── Privacy → Public (Outbound Issuance) ────────────────────────────────────

/**
 * Bridge tokens from Privacy Node → Public Chain.
 *
 * Flow:
 *   1. Agent holds tokens on Privacy Node
 *   2. Agent calls `teleportToPublicChain(to, value, chainId)` on the token
 *   3. Token locks on Privacy Node, relayer mints on Public Chain mirror
 *
 * @param tokenAddress   Privacy Node ERC-20 address
 * @param amount         Amount in raw units (wei)
 * @param recipient      Recipient address on Public Chain
 */
export async function teleportToPublicChain(
  tokenAddress: string,
  amount: bigint,
  recipient: string,
): Promise<TeleportResult> {
  const wallet = getAgentWallet();
  const token = new ethers.Contract(tokenAddress, RAYLS_ERC20_HANDLER_ABI, wallet);

  const balance: bigint = await token.balanceOf(wallet.address);
  if (balance < amount) {
    throw new Error(`Insufficient balance: have ${balance}, need ${amount}`);
  }

  const publicChainId = config.publicChain.chainId;
  console.log(`[TELEPORT] Privacy → Public: ${ethers.formatEther(amount)} tokens`);
  console.log(`[TELEPORT] Token: ${tokenAddress}`);
  console.log(`[TELEPORT] To: ${recipient} on chain ${publicChainId}`);

  const tx = await token.teleportToPublicChain(recipient, amount, publicChainId);
  const receipt = await tx.wait();

  console.log(`[TELEPORT] Confirmed: ${tx.hash} (block ${receipt.blockNumber})`);

  return {
    txHash: tx.hash,
    amount,
    direction: "private-to-public",
    token: tokenAddress,
  };
}

// ─── Capital Detection ───────────────────────────────────────────────────────

/**
 * Check if the agent has received new capital on the Public Chain.
 * Returns the native USDr balance of the agent wallet.
 */
export async function checkPublicChainBalance(): Promise<bigint> {
  const provider = getPublicChainProvider();
  const wallet = getAttestationWriterWallet();
  return provider.getBalance(wallet.address);
}

/**
 * Check balance of a specific mirror token on Public Chain.
 */
export async function checkMirrorBalance(mirrorAddress: string): Promise<bigint> {
  const wallet = getAttestationWriterWallet();
  const mirror = new ethers.Contract(mirrorAddress, PUBLIC_CHAIN_MIRROR_ABI, wallet.provider!);
  return mirror.balanceOf(wallet.address) as Promise<bigint>;
}
