export interface ShockEvent {
  asset: string;
  newRiskScore: number;
  newYieldBps?: number;
  reason: string;
}

export interface ShockResult {
  asset: string;
  previousRiskScore: number;
  newRiskScore: number;
  txHash: string;
  appliedAt: number;
}
