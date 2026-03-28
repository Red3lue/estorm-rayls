import type { VaultSnapshot } from "./vault.js";

// ── Strategy Interface (pluggable) ─────────────────────────────────────────

export interface StrategyParams {
  maxSingleAssetExposure: number;  // 0.40 = 40%
  minLiquidity: number;            // 0.15 = 15%
  targetYield: number;             // 7.0 = 7%
  maxRiskScore: number;            // 65
  rebalanceTrigger: number;        // 0.05 = 5% drift
}

export interface IStrategy {
  readonly name: string;
  readonly params: StrategyParams;
  buildPrompt(snapshot: VaultSnapshot, perspective: AgentPerspective): string;
}

// ── Agent Perspectives ─────────────────────────────────────────────────────

export type AgentPerspective = "risk" | "yield" | "compliance" | "balanced";

export interface AgentIdentity {
  id: string;
  perspective: AgentPerspective;
  systemPrompt: string;
}

// ── Agent Decision (returned by each LLM agent) ───────────────────────────

export interface RebalanceAction {
  type: "swap" | "mint" | "burn";
  fromAsset: string;
  toAsset: string;
  amount: number;
  reason: string;
}

export interface CertifyDecision {
  nftSymbol: string;
  approved: boolean;
  provenanceAssessment: string;
  qualityScore: number;    // 0-100
  riskRating: number;      // 0-100
  reason: string;
}

export interface IssueDecision {
  action: "update_nav" | "mint_receipt" | "list" | "delist";
  asset: string;
  reason: string;
}

export interface AgentDecision {
  agentId: string;
  perspective: AgentPerspective;
  rebalance: RebalanceAction[];
  certify: CertifyDecision[];
  issue: IssueDecision[];
  reasoning: string;
}

// ── Quorum Results ─────────────────────────────────────────────────────────

export interface QuorumAction<T> {
  action: T;
  approvedBy: string[];
  rejectedBy: string[];
  approved: boolean;
}

export interface QuorumResult {
  rebalance: QuorumAction<RebalanceAction>[];
  certify: QuorumAction<CertifyDecision>[];
  issue: QuorumAction<IssueDecision>[];
  rawDecisions: AgentDecision[];
  quorumThreshold: number;
  totalAgents: number;
}

// ── LLM Adapter Interface ──────────────────────────────────────────────────

export interface ILLMAdapter {
  readonly name: string;
  invoke(systemPrompt: string, userPrompt: string): Promise<string>;
}

// ── Think Module Output ────────────────────────────────────────────────────

export interface ThinkResult {
  quorum: QuorumResult;
  durationMs: number;
}
