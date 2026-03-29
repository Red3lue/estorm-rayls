import { ethers } from "ethers";
import type { VaultSnapshot } from "../../types/vault.js";
import type { QuorumAction, RebalanceAction, CertifyDecision, IssueDecision } from "../../types/think.js";
import { AssetCategory } from "../../types/execute.js";

export interface EncodedProposal {
  target: string;
  callData: string;
  category: AssetCategory;
  reasoning: string;
  quorumVotes: number;
}

const VAULT_LEDGER_IFACE = new ethers.Interface([
  "function swap(address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address dex)",
  "function updatePortfolio(address[] tokens, uint8[] riskScores, uint256[] yieldBps)",
  "function updateERC721(address tokenAddress, uint256 tokenId, uint256 valuationUSD, bool certified, uint8 certScore, uint8 riskScore)",
]);

function resolveAddress(symbol: string, snapshot: VaultSnapshot): string {
  const fungible = snapshot.fungibles.find(f => f.symbol === symbol);
  if (fungible) return fungible.address;
  const nft = snapshot.nonFungibles.find(n => n.symbol === symbol);
  if (nft) return nft.address;
  return ethers.ZeroAddress;
}

function symbolToCategory(symbol: string): AssetCategory {
  if (symbol.startsWith("BOND")) return AssetCategory.BOND;
  if (symbol.startsWith("RECV")) return AssetCategory.RECEIVABLE;
  if (symbol.startsWith("STABLE")) return AssetCategory.STABLECOIN;
  if (symbol.startsWith("ART")) return AssetCategory.ART;
  return AssetCategory.BOND;
}

export function encodeRebalance(
  qa: QuorumAction<RebalanceAction>,
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
): EncodedProposal {
  const a = qa.action;
  const fromAddr = resolveAddress(a.fromAsset, snapshot);
  const toAddr = resolveAddress(a.toAsset, snapshot);
  const amountRaw = ethers.parseUnits(a.amount.toString(), 18);

  const callData = VAULT_LEDGER_IFACE.encodeFunctionData("swap", [
    fromAddr, amountRaw, toAddr, amountRaw, ethers.ZeroAddress,
  ]);

  return {
    target: vaultLedgerAddr,
    callData,
    category: symbolToCategory(a.fromAsset),
    reasoning: `REBALANCE [${qa.approvedBy.length}/${qa.approvedBy.length + qa.rejectedBy.length}]: ${a.type} ${a.fromAsset} → ${a.toAsset} ($${a.amount}). ${a.reason}`,
    quorumVotes: qa.approvedBy.length,
  };
}

export function encodeCertify(
  qa: QuorumAction<CertifyDecision>,
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
): EncodedProposal {
  const a = qa.action;
  const nft = snapshot.nonFungibles.find(n => n.symbol === a.nftSymbol);
  const tokenAddr = nft?.address ?? ethers.ZeroAddress;
  const tokenId = nft?.tokenId ?? 1n;
  const valuationCents = Math.round((nft?.valuation ?? 0) * 100);

  const callData = VAULT_LEDGER_IFACE.encodeFunctionData("updateERC721", [
    tokenAddr, tokenId, valuationCents, a.approved, a.qualityScore, a.riskRating,
  ]);

  return {
    target: vaultLedgerAddr,
    callData,
    category: AssetCategory.ART,
    reasoning: `CERTIFICATION [${qa.approvedBy.length}/${qa.approvedBy.length + qa.rejectedBy.length}]: ${a.nftSymbol} ${a.approved ? "APPROVED" : "REJECTED"}. ${a.reason}`,
    quorumVotes: qa.approvedBy.length,
  };
}

export function encodeIssue(
  qa: QuorumAction<IssueDecision>,
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
): EncodedProposal | null {
  const a = qa.action;

  if (a.action === "update_nav") {
    const tokens = snapshot.fungibles.map(f => f.address);
    const risks = snapshot.fungibles.map(f => f.riskScore);
    const yields = snapshot.fungibles.map(f => Math.round(f.yieldRate * 100));

    const callData = VAULT_LEDGER_IFACE.encodeFunctionData("updatePortfolio", [tokens, risks, yields]);

    return {
      target: vaultLedgerAddr,
      callData,
      category: AssetCategory.NAV_UPDATE,
      reasoning: `ISSUANCE [${qa.approvedBy.length}/${qa.approvedBy.length + qa.rejectedBy.length}]: ${a.action} on ${a.asset}. ${a.reason}`,
      quorumVotes: qa.approvedBy.length,
    };
  }

  // mint_receipt, list, delist — these target Public Chain contracts (US-2C.5)
  // For now, return null and let the Issue module handle them
  return null;
}

/**
 * Encodes all quorum-approved actions into VaultPolicy.propose() calldata.
 */
export function encodeApprovedActions(
  rebalance: QuorumAction<RebalanceAction>[],
  certify: QuorumAction<CertifyDecision>[],
  issue: QuorumAction<IssueDecision>[],
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
): EncodedProposal[] {
  const proposals: EncodedProposal[] = [];

  for (const qa of rebalance.filter(a => a.approved)) {
    proposals.push(encodeRebalance(qa, snapshot, vaultLedgerAddr));
  }
  for (const qa of certify.filter(a => a.approved)) {
    proposals.push(encodeCertify(qa, snapshot, vaultLedgerAddr));
  }
  for (const qa of issue.filter(a => a.approved)) {
    const encoded = encodeIssue(qa, snapshot, vaultLedgerAddr);
    if (encoded) proposals.push(encoded);
  }

  return proposals;
}
