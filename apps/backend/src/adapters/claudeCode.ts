import { spawn } from "node:child_process";
import type { ILLMAdapter } from "../types/think.js";

/**
 * Invokes Claude Code CLI locally via `claude -p`.
 * Pipes the prompt via stdin to avoid command-line length limits.
 * Subscription-based — no API key needed.
 */
export class ClaudeCodeAdapter implements ILLMAdapter {
  readonly name = "claude-code";

  async invoke(systemPrompt: string, userPrompt: string): Promise<string> {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    return new Promise((resolve, reject) => {
      const proc = spawn("claude", ["-p", "--output-format", "text"], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 180_000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Claude Code CLI exited with code ${code}\nstderr: ${stderr}`));
          return;
        }
        resolve(stdout.trim());
      });

      proc.on("error", (err) => {
        reject(new Error(`Claude Code CLI failed: ${err.message}`));
      });

      // Write prompt to stdin and close
      proc.stdin.write(fullPrompt);
      proc.stdin.end();
    });
  }
}
