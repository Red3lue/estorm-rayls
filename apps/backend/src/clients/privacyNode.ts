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

export function getAgentWallet(): ethers.Wallet {
  if (!wallet) {
    wallet = new ethers.Wallet(config.keys.deployer, getPrivacyNodeProvider());
  }
  return wallet;
}
