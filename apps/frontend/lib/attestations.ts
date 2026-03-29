import { ethers } from "ethers";
import { PUBLIC_CHAIN_RPC, CONTRACTS } from "./config";
import { ATTESTATION_ABI } from "./abis";

export interface AttestationRecord {
  token: string;
  attester: string;
  approved: boolean;
  reason: string;
  score: number;
  timestamp: number;
  decisionType: number;
  decisionOrigin: number;
  quorumVotes: number;
  quorumTotal: number;
  nav: number;
  riskScore: number;
  portfolioBreakdown: string;
  yieldHistory: string;
}

let providerInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(PUBLIC_CHAIN_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

const ALL_TOKENS = [
  CONTRACTS.bondGov,
  CONTRACTS.recvAcme,
  CONTRACTS.recvBeta,
  CONTRACTS.stableUsdr,
  CONTRACTS.picassoNft,
  CONTRACTS.warholNft,
  CONTRACTS.vaultLedger,
];

export async function fetchAttestations(): Promise<AttestationRecord[]> {
  const attestationAddress = CONTRACTS.attestation;
  if (!attestationAddress) return [];

  const provider = getProvider();
  const contract = new ethers.Contract(
    attestationAddress,
    ATTESTATION_ABI,
    provider,
  );

  const results = await Promise.allSettled(
    ALL_TOKENS.map((token) => contract.getAttestations(token)),
  );

  const records: AttestationRecord[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const raw of result.value) {
      records.push({
        token: raw.token,
        attester: raw.attester,
        approved: raw.approved,
        reason: raw.reason,
        score: Number(raw.score),
        timestamp: Number(raw.timestamp),
        decisionType: Number(raw.decisionType),
        decisionOrigin: Number(raw.decisionOrigin),
        quorumVotes: Number(raw.quorumVotes),
        quorumTotal: Number(raw.quorumTotal),
        nav: Number(raw.nav),
        riskScore: Number(raw.riskScore),
        portfolioBreakdown: raw.portfolioBreakdown,
        yieldHistory: raw.yieldHistory,
      });
    }
  }

  records.sort((a, b) => b.timestamp - a.timestamp);
  return records;
}
