import { execFile } from "node:child_process";
import type { ILLMAdapter } from "../types/think.js";

/**
 * Invokes Claude Code CLI locally via `claude -p`.
 * Subscription-based — no API key needed.
 */
export class ClaudeCodeAdapter implements ILLMAdapter {
  readonly name = "claude-code";

  async invoke(systemPrompt: string, userPrompt: string): Promise<string> {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    return new Promise((resolve, reject) => {
      const proc = execFile(
        "claude",
        ["-p", fullPrompt, "--output-format", "text"],
        { maxBuffer: 1024 * 1024, timeout: 120_000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`Claude Code CLI failed: ${err.message}\nstderr: ${stderr}`));
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
  }
}
