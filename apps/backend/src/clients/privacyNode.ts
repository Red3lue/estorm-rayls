import { ethers } from "ethers";
import { config } from "../config/index.js";

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

export function getPrivacyNodeProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.privacyNode.rpcUrl, {
      name: "rayls-privacy-node",
      chainId: config.privacyNode.chainId,
    });
  }
  return provider;
}

/**
 * Returns the agent wallet for Privacy Node operations.
 * Hackathon: uses PROTOCOL_OWNER_PRIVATE_KEY if set (same key as VaultPolicy agent),
 * falls back to DEPLOYER_PRIVATE_KEY.
 */
export function getAgentWallet(): ethers.Wallet {
  if (!wallet) {
    const key = config.keys.protocolOwner || config.keys.deployer;
    wallet = new ethers.Wallet(key, getPrivacyNodeProvider());
  }
  return wallet;
}
