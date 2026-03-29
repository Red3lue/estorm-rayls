import type { VaultSnapshot, FungibleAsset, NonFungibleAsset } from "../../types/vault.js";
import type { IStrategy, StrategyParams, AgentPerspective } from "../../types/think.js";
import { ethers } from "ethers";

const DEFAULT_PARAMS: StrategyParams = {
  maxSingleAssetExposure: 0.40,
  minLiquidity: 0.15,
  targetYield: 7.0,
  maxRiskScore: 65,
  rebalanceTrigger: 0.05,
};

export class DefaultStrategy implements IStrategy {
  readonly name = "sovereign-vault-default";
  readonly params: StrategyParams;

  constructor(params?: Partial<StrategyParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  buildPrompt(snapshot: VaultSnapshot, perspective: AgentPerspective): string {
    const p = this.params;
    return `You are an AI investment analyst for a Sovereign Vault Protocol managing tokenized real-world assets on a privacy blockchain.

Your perspective: ${PERSPECTIVE_DESCRIPTIONS[perspective]}

## Strategy Parameters
- Max single-asset exposure: ${p.maxSingleAssetExposure * 100}%
- Min liquidity (stablecoin reserve): ${p.minLiquidity * 100}%
- Target portfolio yield: ${p.targetYield}%+
- Max acceptable risk score: ${p.maxRiskScore}/100
- Rebalance trigger: >${p.rebalanceTrigger * 100}% drift from target allocation

## Current Vault State
- NAV: $${snapshot.nav.toLocaleString("en-US")}
- Total Value (incl. NFTs): $${snapshot.totalValue.toLocaleString("en-US")}
- Portfolio Risk: ${snapshot.portfolioRiskScore}/100
- Portfolio Yield: ${snapshot.portfolioYield}%
- Liquidity Ratio: ${(snapshot.liquidityRatio * 100).toFixed(1)}%

### Fungible Assets (ERC-20)
${formatFungibles(snapshot.fungibles)}

### Non-Fungible Assets (ERC-721)
${formatNonFungibles(snapshot.nonFungibles)}

## Your Task
Analyze the vault and propose THE SINGLE MOST IMPORTANT ACTION to take right now.
Pick exactly ONE action — either a rebalance swap, an NFT certification, or an issuance action.
Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "actionType": "rebalance" | "certify" | "issue" | "none",
  "rebalance": { "type": "swap|mint|burn", "fromAsset": "SYMBOL", "toAsset": "SYMBOL", "amount": <number in USD>, "reason": "..." } | null,
  "certify": { "nftSymbol": "SYMBOL", "approved": true|false, "provenanceAssessment": "...", "qualityScore": 0-100, "riskRating": 0-100, "reason": "..." } | null,
  "issue": { "action": "update_nav|mint_receipt|list|delist", "asset": "SYMBOL", "reason": "..." } | null,
  "reasoning": "Overall analysis summary from your perspective"
}

Rules:
- You MUST propose exactly ONE action. Set the matching field and set the others to null.
- Set actionType to "none" (all fields null) only if the portfolio is perfectly balanced.
- STRONGLY PREFER rebalance swaps — the portfolio almost always has drift or risk/yield imbalance to correct. Propose a swap if ANY allocation drifts more than ${p.rebalanceTrigger * 100}% from ideal, or if risk/yield can be improved.
- Keep swap amounts SMALL (under $40,000 USD) to stay within auto-execution limits.
- Only propose certify or issue if there is truly nothing to rebalance.
- Only certify NFTs that are currently UNCERTIFIED.
- Issue update_nav if NAV changed; mint_receipt only for newly certified NFTs.`;
  }
}

const PERSPECTIVE_DESCRIPTIONS: Record<AgentPerspective, string> = {
  risk: "RISK-FOCUSED — You prioritize capital preservation and downside protection. Flag any asset exceeding risk thresholds. Prefer reducing exposure to high-risk assets even at the cost of yield.",
  yield: "YIELD-FOCUSED — You prioritize maximizing portfolio yield while staying within risk bounds. Recommend allocating toward higher-yielding assets when risk is manageable.",
  compliance: "COMPLIANCE-FOCUSED — You prioritize regulatory compliance, proper certification, and governance. Ensure all assets meet institutional standards. Flag any uncertified assets that should not be in the portfolio.",
  balanced: "BALANCED — You weigh risk, yield, liquidity, and compliance equally. Make pragmatic decisions that optimize the overall portfolio health.",
};

function formatFungibles(assets: FungibleAsset[]): string {
  if (assets.length === 0) return "None";
  return assets.map(a => {
    const bal = Number(ethers.formatUnits(a.balance, a.decimals));
    return `- ${a.symbol}: balance=${bal.toLocaleString("en-US")}, value=$${a.value.toLocaleString("en-US")}, allocation=${a.allocationPct}%, yield=${a.yieldRate}%, risk=${a.riskScore}/100`;
  }).join("\n");
}

function formatNonFungibles(assets: NonFungibleAsset[]): string {
  if (assets.length === 0) return "None";
  return assets.map(n =>
    `- ${n.symbol} (ID: ${n.tokenId}): valuation=$${n.valuation.toLocaleString("en-US")}, status=${n.certificationStatus}, risk=${n.riskScore}/100`
  ).join("\n");
}
