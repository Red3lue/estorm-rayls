import { ethers } from "ethers";
import { PRIVACY_NODE_RPC, CONTRACTS, DEPLOYER_KEY } from "./config";
import { VAULT_POLICY_ABI } from "./abis";

// ── Types ────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<number, string> = {
  0: "Bonds",
  1: "Receivables",
  2: "Stablecoins",
  3: "Art / NFTs",
  4: "NAV Update",
  5: "Issuance",
};

export const STATUS_LABELS: Record<number, string> = {
  0: "PENDING",
  1: "AUTO_EXECUTED",
  2: "APPROVED",
  3: "DISMISSED",
  4: "WITHDRAWN",
};

export interface Proposal {
  id: number;
  target: string;
  category: number;
  valueUSD: number;
  reasoning: string;
  quorumVotes: number;
  status: number;
  createdAt: number;
  resolvedAt: number;
  resolvedBy: string;
}

export interface GovernanceSettings {
  valueThreshold: number;
  maxTxPerWindow: number;
  windowDuration: number;
  paused: boolean;
  categoryPermissions: boolean[];
}

export interface GovernanceSnapshot {
  pending: Proposal | null;
  settings: GovernanceSettings;
  history: Proposal[];
  timestamp: number;
}

// ── Provider / Contract ──────────────────────────────────────────────────────

let providerInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(PRIVACY_NODE_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

function getReadContract(): ethers.Contract {
  return new ethers.Contract(
    CONTRACTS.vaultPolicy,
    VAULT_POLICY_ABI,
    getProvider(),
  );
}

function getWriteContract(): ethers.Contract {
  const wallet = new ethers.Wallet(DEPLOYER_KEY, getProvider());
  return new ethers.Contract(CONTRACTS.vaultPolicy, VAULT_POLICY_ABI, wallet);
}

function mapProposal(raw: {
  id: bigint;
  target: string;
  category: number;
  valueUSD: bigint;
  reasoning: string;
  quorumVotes: number;
  status: number;
  createdAt: bigint;
  resolvedAt: bigint;
  resolvedBy: string;
}): Proposal {
  return {
    id: Number(raw.id),
    target: raw.target,
    category: Number(raw.category),
    valueUSD: Number(raw.valueUSD),
    reasoning: raw.reasoning,
    quorumVotes: Number(raw.quorumVotes),
    status: Number(raw.status),
    createdAt: Number(raw.createdAt),
    resolvedAt: Number(raw.resolvedAt),
    resolvedBy: raw.resolvedBy,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function fetchGovernanceSnapshot(): Promise<GovernanceSnapshot> {
  if (!CONTRACTS.vaultPolicy) {
    return {
      pending: null,
      settings: {
        valueThreshold: 0,
        maxTxPerWindow: 0,
        windowDuration: 0,
        paused: false,
        categoryPermissions: [true, true, true, true, true, true],
      },
      history: [],
      timestamp: Date.now(),
    };
  }

  const contract = getReadContract();

  const [pendingRaw, settingsRaw, historyRaw] = await Promise.all([
    contract.getPendingProposal(),
    contract.getSettings(),
    contract.getProposalHistory(),
  ]);

  const pending =
    Number(pendingRaw.id) > 0 ? mapProposal(pendingRaw) : null;

  const [rules, categoryPerms] = settingsRaw;
  const settings: GovernanceSettings = {
    valueThreshold: Number(rules.valueThreshold),
    maxTxPerWindow: Number(rules.maxTxPerWindow),
    windowDuration: Number(rules.windowDuration),
    paused: rules.paused,
    categoryPermissions: Array.from(categoryPerms) as boolean[],
  };

  const history: Proposal[] = historyRaw
    .map(mapProposal)
    .sort(
      (a: Proposal, b: Proposal) => b.createdAt - a.createdAt,
    );

  return { pending, settings, history, timestamp: Date.now() };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function approveProposal(
  proposalId: number,
): Promise<{ txHash: string }> {
  const contract = getWriteContract();
  const tx = await contract.approve(proposalId, { gasLimit: 500_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function dismissProposal(
  proposalId: number,
): Promise<{ txHash: string }> {
  const contract = getWriteContract();
  const tx = await contract.dismiss(proposalId, { gasLimit: 500_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function emergencyStop(): Promise<{ txHash: string }> {
  const contract = getWriteContract();
  const tx = await contract.emergencyStop({ gasLimit: 200_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function resumeOperations(): Promise<{ txHash: string }> {
  const contract = getWriteContract();
  const tx = await contract.resume({ gasLimit: 200_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}
