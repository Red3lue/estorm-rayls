import { ethers } from "ethers";
import { config } from "../config/index.js";

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

export function getPublicChainProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.publicChain.rpcUrl, {
      name: "rayls-public-chain",
      chainId: config.publicChain.chainId,
    });
  }
  return provider;
}

export function getPublicChainWallet(): ethers.Wallet {
  if (!wallet) {
    if (!config.keys.publicDeployer) {
      throw new Error("PUBLIC_DEPLOYER_KEY is required for Public Chain transactions");
    }
    wallet = new ethers.Wallet(config.keys.publicDeployer, getPublicChainProvider());
  }
  return wallet;
}
