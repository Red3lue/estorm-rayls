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
Analyze the vault and return a JSON object with exactly this structure. Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "rebalance": [
    { "type": "swap|mint|burn", "fromAsset": "SYMBOL", "toAsset": "SYMBOL", "amount": <number in USD>, "reason": "..." }
  ],
  "certify": [
    { "nftSymbol": "SYMBOL", "approved": true|false, "provenanceAssessment": "...", "qualityScore": 0-100, "riskRating": 0-100, "reason": "..." }
  ],
  "issue": [
    { "action": "update_nav|mint_receipt|list|delist", "asset": "SYMBOL", "reason": "..." }
  ],
  "reasoning": "Overall analysis summary from your perspective"
}

Rules:
- Only include rebalance actions if drift exceeds ${p.rebalanceTrigger * 100}% or risk/yield is out of bounds
- Only certify NFTs that are currently UNCERTIFIED
- Issue update_nav if NAV changed; mint_receipt only for newly certified NFTs
- If no action is needed for a category, return an empty array []`;
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
