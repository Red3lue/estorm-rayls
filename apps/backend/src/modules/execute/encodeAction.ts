import { ethers } from "ethers";
import { config } from "../../config/index.js";
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
  "function createDvPExchange(address tokenIn, uint256 amountIn, address counterparty, address tokenOut, uint256 amountOut, address dvpExchange, uint256 expiration)",
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

/**
 * Convert a USD amount to raw token units using snapshot data.
 * AI returns amounts in USD; we need raw units (balance * 10^decimals).
 */
function usdToTokenAmount(usdAmount: number, symbol: string, snapshot: VaultSnapshot): bigint {
  const asset = snapshot.fungibles.find(f => f.symbol === symbol);
  if (!asset || asset.value === 0) {
    // Fallback: assume $1/token, 18 decimals
    return ethers.parseUnits(usdAmount.toString(), 18);
  }
  // tokenAmount = usdAmount / pricePerToken * 10^decimals
  // pricePerToken = asset.value / (balance / 10^decimals)
  // Simpler: ratio = usdAmount / asset.value → tokenAmount = ratio * balance
  const ratio = usdAmount / asset.value;
  const rawBalance = asset.balance;
  // Cap at 90% of available balance to avoid over-selling
  const capped = Math.min(ratio, 0.9);
  return BigInt(Math.floor(Number(rawBalance) * capped));
}

export function encodeRebalance(
  qa: QuorumAction<RebalanceAction>,
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
): EncodedProposal {
  const a = qa.action;
  const fromAddr = resolveAddress(a.fromAsset, snapshot);
  const toAddr = resolveAddress(a.toAsset, snapshot);
  const amountIn = usdToTokenAmount(a.amount, a.fromAsset, snapshot);
  const amountOut = usdToTokenAmount(a.amount, a.toAsset, snapshot);

  const dexAddr = config.contracts.mockDex || ethers.ZeroAddress;
  const callData = VAULT_LEDGER_IFACE.encodeFunctionData("swap", [
    fromAddr, amountIn, toAddr, amountOut, dexAddr,
  ]);

  return {
    target: vaultLedgerAddr,
    callData,
    category: symbolToCategory(a.fromAsset),
    reasoning: `REBALANCE [${qa.approvedBy.length}/${qa.approvedBy.length + qa.rejectedBy.length}]: ${a.type} ${a.fromAsset} → ${a.toAsset} ($${a.amount}). ${a.reason}`,
    quorumVotes: qa.approvedBy.length,
  };
}

/**
 * Encodes a rebalance action as a DvP exchange (Rayls-native atomic swap).
 * Used instead of encodeRebalance when a DvP counterparty is available.
 */
export function encodeDvPRebalance(
  qa: QuorumAction<RebalanceAction>,
  snapshot: VaultSnapshot,
  vaultLedgerAddr: string,
  dvpExchangeAddr: string,
  counterparty: string,
  expirationSec: number = 3600,
): EncodedProposal {
  const a = qa.action;
  const fromAddr = resolveAddress(a.fromAsset, snapshot);
  const toAddr = resolveAddress(a.toAsset, snapshot);
  const amountRaw = ethers.parseUnits(a.amount.toString(), 18);
  const expiration = Math.floor(Date.now() / 1000) + expirationSec;

  const callData = VAULT_LEDGER_IFACE.encodeFunctionData("createDvPExchange", [
    fromAddr, amountRaw, counterparty, toAddr, amountRaw, dvpExchangeAddr, expiration,
  ]);

  return {
    target: vaultLedgerAddr,
    callData,
    category: symbolToCategory(a.fromAsset),
    reasoning: `DvP REBALANCE [${qa.approvedBy.length}/${qa.approvedBy.length + qa.rejectedBy.length}]: ${a.type} ${a.fromAsset} → ${a.toAsset} ($${a.amount}). ${a.reason}`,
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
