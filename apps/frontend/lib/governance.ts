import { ethers } from "ethers";
import {
  PRIVACY_NODE_RPC,
  PUBLIC_CHAIN_RPC,
  CONTRACTS,
  GOVERNANCE_MANAGER_KEY,
  ATTESTATION_WRITER_KEY,
} from "./config";
import { VAULT_POLICY_ABI, ATTESTATION_ABI, VAULT_LEDGER_ABI } from "./abis";

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
  callData: string;
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
let publicProviderInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(PRIVACY_NODE_RPC, undefined, {
      staticNetwork: true,
    });
  }
  return providerInstance;
}

function getPublicProvider(): ethers.JsonRpcProvider {
  if (!publicProviderInstance) {
    publicProviderInstance = new ethers.JsonRpcProvider(
      PUBLIC_CHAIN_RPC,
      undefined,
      {
        staticNetwork: true,
      },
    );
  }
  return publicProviderInstance;
}

function getReadContract(): ethers.Contract {
  return new ethers.Contract(
    CONTRACTS.vaultPolicy,
    VAULT_POLICY_ABI,
    getProvider(),
  );
}

async function getWriteContract(): Promise<ethers.Contract> {
  const wallet = new ethers.Wallet(GOVERNANCE_MANAGER_KEY, getProvider());
  const contract = new ethers.Contract(
    CONTRACTS.vaultPolicy,
    VAULT_POLICY_ABI,
    wallet,
  );

  // Fail fast with a clear message instead of an opaque on-chain revert.
  const [signerAddress, managerAddress] = await Promise.all([
    wallet.getAddress(),
    contract.manager(),
  ]);

  if (signerAddress.toLowerCase() !== managerAddress.toLowerCase()) {
    throw new Error(
      `Configured signer ${signerAddress} is not VaultPolicy manager ${managerAddress}. ` +
        "Set GOVERNANCE_MANAGER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) to the manager key.",
    );
  }

  return contract;
}

function mapProposal(raw: {
  id: bigint;
  target: string;
  callData: string;
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
    callData: raw.callData,
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

function decisionTypeFromCategory(category: number): number {
  // 0=REBALANCE, 1=CERTIFICATION, 2=ISSUANCE
  if (category === 3) return 1;
  if (category === 4 || category === 5) return 2;
  return 0;
}

function inferTokenFromProposal(proposal: Proposal): string {
  if (!proposal.callData || proposal.callData.length < 10) {
    return proposal.target;
  }

  const iface = new ethers.Interface([
    "function swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address dex)",
    "function createDvPExchange(address tokenIn, uint256 amountIn, address counterparty, address tokenOut, uint256 amountOut, address dvpExchange, uint256 expiration)",
    "function updatePortfolio(address[] tokens, uint8[] riskScores, uint256[] yieldBps)",
    "function updateERC721(address tokenAddress, uint256 tokenId, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore)",
  ]);

  try {
    const parsed = iface.parseTransaction({ data: proposal.callData });
    if (!parsed) return proposal.target;

    if (parsed.name === "swap" || parsed.name === "createDvPExchange") {
      return (parsed.args[0] as string) || proposal.target;
    }
    if (parsed.name === "updateERC721") {
      return (parsed.args[0] as string) || proposal.target;
    }
    if (parsed.name === "updatePortfolio") {
      const tokens = parsed.args[0] as string[];
      return tokens[0] || proposal.target;
    }
  } catch {
    // If calldata isn't one of the expected ledger methods, fall back to target.
  }

  return proposal.target;
}

async function attestApprovedProposal(proposal: Proposal): Promise<string> {
  if (!CONTRACTS.attestation) {
    throw new Error("ATTESTATION_ADDRESS not configured");
  }
  if (!ATTESTATION_WRITER_KEY) {
    throw new Error(
      "ATTESTATION_WRITER_KEY (or PROTOCOL_OWNER_PRIVATE_KEY / DEPLOYER_PRIVATE_KEY) is required",
    );
  }

  const attestationWallet = new ethers.Wallet(
    ATTESTATION_WRITER_KEY,
    getPublicProvider(),
  );
  const attestationContract = new ethers.Contract(
    CONTRACTS.attestation,
    ATTESTATION_ABI,
    attestationWallet,
  );

  try {
    const owner = await attestationContract.owner();
    if (owner.toLowerCase() !== attestationWallet.address.toLowerCase()) {
      throw new Error(
        `Configured attestation writer ${attestationWallet.address} is not Attestation owner ${owner}`,
      );
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("is not Attestation owner")
    ) {
      throw err;
    }
  }

  const ledger = new ethers.Contract(
    CONTRACTS.vaultLedger,
    VAULT_LEDGER_ABI,
    getProvider(),
  );
  const [navRaw, vaultSnapshot] = await Promise.all([
    ledger.getNAV(),
    ledger.getVaultSnapshot(),
  ]);

  const [fungibles] = vaultSnapshot as [
    Array<{
      tokenAddress: string;
      symbol: string;
      balance: bigint;
      valueUSD: bigint;
      allocationPct: number;
      riskScore: number;
      yieldBps: bigint;
      active: boolean;
    }>,
    unknown,
  ];

  let weightedRisk = 0;
  for (const asset of fungibles) {
    const pct = Number(asset.allocationPct) / 100;
    weightedRisk += Number(asset.riskScore) * pct;
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round((proposal.quorumVotes / 4) * 100)),
  );

  const payload = {
    attester: attestationWallet.address,
    token: inferTokenFromProposal(proposal),
    approved: true,
    reason: `HUMAN APPROVED proposal #${proposal.id}: ${proposal.reasoning || "No reasoning provided"}`,
    score,
    timestamp: Math.floor(Date.now() / 1000),
    decisionType: decisionTypeFromCategory(proposal.category),
    decisionOrigin: 1, // HUMAN_APPROVED
    quorumVotes: proposal.quorumVotes,
    quorumTotal: 4,
    nav: Number(navRaw),
    riskScore: Math.round(weightedRisk),
    portfolioBreakdown: JSON.stringify(
      fungibles.map((asset) => ({
        token: asset.tokenAddress,
        symbol: asset.symbol,
        valueUSD: Number(asset.valueUSD),
        allocationPct: Number(asset.allocationPct),
        riskScore: Number(asset.riskScore),
        yieldBps: Number(asset.yieldBps),
      })),
    ),
    yieldHistory: JSON.stringify({
      timestamp: Date.now(),
      yields: fungibles.map((asset) => ({
        symbol: asset.symbol,
        yieldBps: Number(asset.yieldBps),
      })),
    }),
  };

  const attestTx = await attestationContract.attest(payload, {
    gasLimit: 2_000_000,
  });
  const attestReceipt = await attestTx.wait();
  return attestReceipt.hash;
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

  // getPendingProposal() reverts with "no pending proposal" when none exists
  const pendingIdRaw = await contract.pendingProposalId();
  let pending: Proposal | null = null;

  if (Number(pendingIdRaw) > 0) {
    try {
      const pendingRaw = await contract.getPendingProposal();
      pending = mapProposal(pendingRaw);
    } catch {
      // reverted — no pending proposal
    }
  }

  const [settingsRaw, historyRaw] = await Promise.all([
    contract.getSettings(),
    contract.getProposalHistory(),
  ]);

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
    .sort((a: Proposal, b: Proposal) => b.createdAt - a.createdAt);

  return { pending, settings, history, timestamp: Date.now() };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function approveProposal(
  proposalId: number,
): Promise<{ txHash: string; attestationTxHash: string }> {
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    throw new Error("Invalid proposalId; expected a positive integer");
  }

  const contract = await getWriteContract();
  const pendingProposal = mapProposal(await contract.getPendingProposal());
  if (pendingProposal.id !== proposalId) {
    throw new Error(
      `Pending proposal mismatch: requested #${proposalId}, active is #${pendingProposal.id}`,
    );
  }

  const tx = await contract.approve(proposalId, { gasLimit: 500_000 });
  const receipt = await tx.wait();

  try {
    const attestationTxHash = await attestApprovedProposal(pendingProposal);
    return { txHash: receipt.hash, attestationTxHash };
  } catch (err) {
    throw new Error(
      `Proposal approved in tx ${receipt.hash}, but attestation failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    );
  }
}

export async function dismissProposal(
  proposalId: number,
): Promise<{ txHash: string }> {
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    throw new Error("Invalid proposalId; expected a positive integer");
  }
  const contract = await getWriteContract();
  const tx = await contract.dismiss(proposalId, { gasLimit: 500_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function emergencyStop(): Promise<{ txHash: string }> {
  const contract = await getWriteContract();
  const tx = await contract.emergencyStop({ gasLimit: 200_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function resumeOperations(): Promise<{ txHash: string }> {
  const contract = await getWriteContract();
  const tx = await contract.resume({ gasLimit: 200_000 });
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}
