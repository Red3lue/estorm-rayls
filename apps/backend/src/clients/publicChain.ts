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

/**
 * Returns the attestation writer wallet — the protocol agent that owns
 * Attestation.sol (immutable ownership, onlyOwner on attest()).
 * This is the ONLY wallet that can call attest() on the institution's contract.
 */
export function getAttestationWriterWallet(): ethers.Wallet {
  if (!wallet) {
    if (!config.keys.attestationWriter) {
      throw new Error("ATTESTATION_WRITER_KEY (or PUBLIC_DEPLOYER_KEY) is required for attestation writes");
    }
    wallet = new ethers.Wallet(config.keys.attestationWriter, getPublicChainProvider());
  }
  return wallet;
}
