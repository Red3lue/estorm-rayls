export interface IssueAction {
  type: "update_nav" | "mint_receipt" | "list" | "delist";
  asset: string;
  txHash: string;
}

export interface IssueResult {
  actions: IssueAction[];
  durationMs: number;
}
