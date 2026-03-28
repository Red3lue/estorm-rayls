export enum DecisionType {
  REBALANCE = 0,
  CERTIFICATION = 1,
  ISSUANCE = 2,
}

export enum DecisionOrigin {
  AI_QUORUM = 0,
  HUMAN_APPROVED = 1,
  HUMAN_INITIATED = 2,
}

export interface AttestationPayload {
  token: string;
  approved: boolean;
  reason: string;
  score: number;
  decisionType: DecisionType;
  decisionOrigin: DecisionOrigin;
  quorumVotes: number;
  quorumTotal: number;
  nav: number;
  riskScore: number;
  portfolioBreakdown: string;
  yieldHistory: string;
}

export interface AttestResult {
  txHash: string;
  blockNumber: number;
  payload: AttestationPayload;
}
