import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getAttestationWriterWallet } from "../../clients/publicChain.js";
import { ATTESTATION_ABI } from "../../abis/index.js";
import type { VaultSnapshot } from "../../types/vault.js";
import type { QuorumResult } from "../../types/think.js";
import type { AttestationPayload, AttestResult } from "../../types/attest.js";
import { buildAttestationPayloads } from "./buildPayload.js";

async function submitAttestation(
  contract: ethers.Contract,
  payload: AttestationPayload,
): Promise<AttestResult> {
  const tx = await contract.attest(
    payload.token,
    payload.approved,
    payload.reason,
    payload.score,
    payload.decisionType,
    payload.decisionOrigin,
    payload.quorumVotes,
    payload.quorumTotal,
    payload.nav,
    payload.riskScore,
    payload.portfolioBreakdown,
    payload.yieldHistory,
    { gasLimit: 2_000_000 },
  );

  console.log(`[ATTEST] Tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[ATTEST] Confirmed in block ${receipt.blockNumber}`);

  return { txHash: tx.hash, blockNumber: receipt.blockNumber, payload };
}

/**
 * ATTEST MODULE — Protocol-owned trust layer.
 *
 * Reads quorum-approved actions and writes attestations to the institution's
 * Attestation.sol on the Public Chain. This module is NON-CUSTOMIZABLE —
 * institutions provide their own Attestation.sol schema, but the writer logic
 * is protocol-owned. The writer wallet is the immutable owner of the contract
 * (onlyOwner on attest(), transferOwnership() reverts).
 */
export async function attest(
  quorum: QuorumResult,
  snapshot: VaultSnapshot,
): Promise<AttestResult[]> {
  console.log("\n[ATTEST] ========================================");
  const t0 = Date.now();

  if (!config.contracts.attestation) {
    console.warn("[ATTEST] No ATTESTATION_ADDRESS configured — skipping");
    return [];
  }

  const wallet = getAttestationWriterWallet();
  console.log(`[ATTEST] Writer: ${wallet.address}`);
  console.log(`[ATTEST] Attestation contract: ${config.contracts.attestation}`);

  const contract = new ethers.Contract(config.contracts.attestation, ATTESTATION_ABI, wallet);
  const payloads = buildAttestationPayloads(quorum, snapshot);

  if (payloads.length === 0) {
    console.log("[ATTEST] No quorum-approved actions to attest");
    return [];
  }

  console.log(`[ATTEST] Writing ${payloads.length} attestation(s)...`);

  const results: AttestResult[] = [];
  for (const payload of payloads) {
    try {
      const result = await submitAttestation(contract, payload);
      results.push(result);
    } catch (err) {
      console.error(`[ATTEST] Failed to attest ${payload.reason.slice(0, 60)}...:`, (err as Error).message);
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`[ATTEST] Done: ${results.length}/${payloads.length} attested in ${elapsed}ms`);
  console.log("[ATTEST] ========================================\n");

  return results;
}
