/** Maps to VaultPolicy.AssetCategory enum */
export enum AssetCategory {
  BOND = 0,
  RECEIVABLE = 1,
  STABLECOIN = 2,
  ART = 3,
  NAV_UPDATE = 4,
  ISSUANCE = 5,
}

/** Maps to VaultPolicy.ProposalStatus enum */
export enum ProposalStatus {
  PENDING = 0,
  AUTO_EXECUTED = 1,
  APPROVED = 2,
  DISMISSED = 3,
  WITHDRAWN = 4,
}

export type DecisionOriginLabel = "AI_QUORUM" | "HUMAN_APPROVED" | "HUMAN_INITIATED";

export interface ProposalOutcome {
  proposalId: number;
  status: ProposalStatus;
  txHash: string;
  decisionOrigin: DecisionOriginLabel;
  reasoning: string;
}

export interface ExecuteResult {
  outcomes: ProposalOutcome[];
  pendingProposalId: number;
  durationMs: number;
}
