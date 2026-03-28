import { ethers } from "ethers";
import type { VaultSnapshot } from "../../types/vault.js";
import type { QuorumResult, QuorumAction, RebalanceAction, CertifyDecision, IssueDecision } from "../../types/think.js";
import { DecisionType, DecisionOrigin, type AttestationPayload } from "../../types/attest.js";

function buildPortfolioBreakdown(snapshot: VaultSnapshot): string {
  const assets = snapshot.fungibles.map(a => ({
    symbol: a.symbol,
    allocationPct: a.allocationPct,
    riskScore: a.riskScore,
    yieldRate: a.yieldRate,
    value: a.value,
  }));
  return JSON.stringify(assets);
}

function buildYieldHistory(snapshot: VaultSnapshot): string {
  return JSON.stringify({
    currentYield: snapshot.portfolioYield,
    liquidityRatio: snapshot.liquidityRatio,
    timestamp: snapshot.timestamp,
  });
}

function quorumConfidence(approvedBy: string[], totalAgents: number): number {
  return Math.round((approvedBy.length / totalAgents) * 100);
}

function summarizeReasoning(quorum: QuorumResult): string {
  return quorum.rawDecisions.map(d => `[${d.perspective}] ${d.reasoning}`).join(" | ");
}

/**
 * Builds attestation payloads from quorum-approved rebalance actions.
 * Each approved rebalance becomes one attestation on the affected asset.
 */
function buildRebalancePayloads(
  approved: QuorumAction<RebalanceAction>[],
  snapshot: VaultSnapshot,
  quorum: QuorumResult,
): AttestationPayload[] {
  return approved.map(qa => ({
    token: snapshot.fungibles.find(f => f.symbol === qa.action.fromAsset)?.address ?? ethers.ZeroAddress,
    approved: true,
    reason: `REBALANCE: ${qa.action.type} ${qa.action.fromAsset} → ${qa.action.toAsset} ($${qa.action.amount}). ${qa.action.reason}`,
    score: quorumConfidence(qa.approvedBy, quorum.totalAgents),
    decisionType: DecisionType.REBALANCE,
    decisionOrigin: DecisionOrigin.AI_QUORUM,
    quorumVotes: qa.approvedBy.length,
    quorumTotal: quorum.totalAgents,
    nav: Math.round(snapshot.nav * 100),
    riskScore: Math.round(snapshot.portfolioRiskScore),
    portfolioBreakdown: buildPortfolioBreakdown(snapshot),
    yieldHistory: buildYieldHistory(snapshot),
  }));
}

/**
 * Builds attestation payloads from quorum-approved certification decisions.
 */
function buildCertifyPayloads(
  approved: QuorumAction<CertifyDecision>[],
  snapshot: VaultSnapshot,
  quorum: QuorumResult,
): AttestationPayload[] {
  return approved.map(qa => ({
    token: snapshot.nonFungibles.find(n => n.symbol === qa.action.nftSymbol)?.address ?? ethers.ZeroAddress,
    approved: qa.action.approved,
    reason: `CERTIFICATION: ${qa.action.nftSymbol} — ${qa.action.provenanceAssessment}. Quality: ${qa.action.qualityScore}/100, Risk: ${qa.action.riskRating}/100. ${qa.action.reason}`,
    score: quorumConfidence(qa.approvedBy, quorum.totalAgents),
    decisionType: DecisionType.CERTIFICATION,
    decisionOrigin: DecisionOrigin.AI_QUORUM,
    quorumVotes: qa.approvedBy.length,
    quorumTotal: quorum.totalAgents,
    nav: Math.round(snapshot.nav * 100),
    riskScore: Math.round(snapshot.portfolioRiskScore),
    portfolioBreakdown: buildPortfolioBreakdown(snapshot),
    yieldHistory: buildYieldHistory(snapshot),
  }));
}

/**
 * Builds attestation payloads from quorum-approved issuance decisions.
 */
function buildIssuePayloads(
  approved: QuorumAction<IssueDecision>[],
  snapshot: VaultSnapshot,
  quorum: QuorumResult,
): AttestationPayload[] {
  return approved.map(qa => ({
    token: snapshot.fungibles.find(f => f.symbol === qa.action.asset)?.address
      ?? snapshot.nonFungibles.find(n => n.symbol === qa.action.asset)?.address
      ?? ethers.ZeroAddress,
    approved: true,
    reason: `ISSUANCE: ${qa.action.action} on ${qa.action.asset}. ${qa.action.reason}`,
    score: quorumConfidence(qa.approvedBy, quorum.totalAgents),
    decisionType: DecisionType.ISSUANCE,
    decisionOrigin: DecisionOrigin.AI_QUORUM,
    quorumVotes: qa.approvedBy.length,
    quorumTotal: quorum.totalAgents,
    nav: Math.round(snapshot.nav * 100),
    riskScore: Math.round(snapshot.portfolioRiskScore),
    portfolioBreakdown: buildPortfolioBreakdown(snapshot),
    yieldHistory: buildYieldHistory(snapshot),
  }));
}

/**
 * Builds all attestation payloads from quorum-approved actions.
 * Only approved actions are attested. Rejected actions are not written on-chain.
 */
export function buildAttestationPayloads(
  quorum: QuorumResult,
  snapshot: VaultSnapshot,
): AttestationPayload[] {
  const approvedRebalance = quorum.rebalance.filter(a => a.approved);
  const approvedCertify = quorum.certify.filter(a => a.approved);
  const approvedIssue = quorum.issue.filter(a => a.approved);

  return [
    ...buildRebalancePayloads(approvedRebalance, snapshot, quorum),
    ...buildCertifyPayloads(approvedCertify, snapshot, quorum),
    ...buildIssuePayloads(approvedIssue, snapshot, quorum),
  ];
}
