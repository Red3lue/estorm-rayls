import type { VaultSnapshot } from "../../types/vault.js";
import type {
  IStrategy,
  ILLMAdapter,
  AgentPerspective,
  AgentIdentity,
  AgentDecision,
  ThinkResult,
} from "../../types/think.js";
import { parseAgentResponse } from "./validation.js";
import { computeQuorum } from "./quorum.js";

const AGENT_PERSPECTIVES: AgentIdentity[] = [
  {
    id: "agent-risk",
    perspective: "risk",
    systemPrompt: "You are a risk-focused investment analyst.",
  },
  // {
  //   id: "agent-yield",
  //   perspective: "yield",
  //   systemPrompt: "You are a yield-focused investment analyst.",
  // },
  // {
  //   id: "agent-compliance",
  //   perspective: "compliance",
  //   systemPrompt: "You are a compliance-focused investment analyst.",
  // },
  // {
  //   id: "agent-balanced",
  //   perspective: "balanced",
  //   systemPrompt: "You are a balanced investment analyst.",
  // },
];

async function invokeAgent(
  agent: AgentIdentity,
  strategy: IStrategy,
  snapshot: VaultSnapshot,
  llm: ILLMAdapter,
): Promise<AgentDecision | null> {
  const prompt = strategy.buildPrompt(snapshot, agent.perspective);
  console.log(`[THINK] Invoking ${agent.id} (${agent.perspective})...`);

  try {
    const raw = await llm.invoke(agent.systemPrompt, prompt);
    const decision = parseAgentResponse(raw, agent.id, agent.perspective);

    if (!decision) {
      console.warn(`[THINK] ${agent.id} returned invalid response, discarding`);
      return null;
    }

    console.log(
      `[THINK] ${agent.id}: ${decision.rebalance.length} rebalance, ${decision.certify.length} certify, ${decision.issue.length} issue actions`,
    );
    return decision;
  } catch (err) {
    console.error(`[THINK] ${agent.id} failed:`, (err as Error).message);
    return null;
  }
}

/**
 * THINK MODULE — Main entry point.
 *
 * Spawns 4 independent AI agents in parallel, each analyzing the vault
 * from a distinct perspective. Applies 3/4 quorum rule to all proposed actions.
 */
export async function think(
  snapshot: VaultSnapshot,
  strategy: IStrategy,
  llm: ILLMAdapter,
): Promise<ThinkResult> {
  console.log("\n[THINK] ========================================");
  console.log(`[THINK] Strategy: ${strategy.name}`);
  console.log(
    `[THINK] Spawning ${AGENT_PERSPECTIVES.length} agents in parallel...`,
  );
  const t0 = Date.now();

  // Spawn all 4 agents in parallel
  const results = await Promise.all(
    AGENT_PERSPECTIVES.map((agent) =>
      invokeAgent(agent, strategy, snapshot, llm),
    ),
  );

  // Filter out failed/invalid responses
  const validDecisions = results.filter((d): d is AgentDecision => d !== null);
  console.log(
    `[THINK] ${validDecisions.length}/${AGENT_PERSPECTIVES.length} agents returned valid decisions`,
  );

  if (validDecisions.length === 0) {
    console.warn("[THINK] No valid decisions — returning empty quorum");
    return {
      quorum: {
        rebalance: [],
        certify: [],
        issue: [],
        rawDecisions: [],
        quorumThreshold: 3,
        totalAgents: 4,
      },
      durationMs: Date.now() - t0,
    };
  }

  const quorum = computeQuorum(validDecisions);
  const durationMs = Date.now() - t0;

  console.log(`[THINK] Done in ${durationMs}ms`);
  console.log("[THINK] ========================================\n");

  return { quorum, durationMs };
}
