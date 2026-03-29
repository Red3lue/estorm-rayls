import express, { Request, Response } from "express";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAttestationWriterWallet } from "../clients/publicChain.js";
import { config } from "../config/index.js";
import { injectShock } from "../modules/shock/index.js";
import { injectOpportunity } from "../modules/opportunity/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load Attestation artifact once at startup ────────────────────────────────

const ARTIFACT_PATH = join(
  __dirname,
  "../../../../packages/contracts/out/Attestation.sol/Attestation.json"
);

function loadArtifact(): { abi: ethers.InterfaceAbi; bytecode: string } {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function createServer() {
  const app = express();
  app.use(express.json());

  /**
   * POST /api/attestation/deploy
   *
   * Deploys Attestation.sol to the Public Chain.
   * The agent wallet (PUBLIC_DEPLOYER_KEY) is the deployer → becomes immutable owner.
   *
   * Response: { address: "0x..." }
   */
  app.post("/api/attestation/deploy", async (_req: Request, res: Response) => {
    try {
      const wallet = getAttestationWriterWallet();
      const { abi, bytecode } = loadArtifact();

      console.log(`[API] Deploying Attestation.sol — agent: ${wallet.address}`);
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      const contract = await factory.deploy({ gasLimit: 3_000_000 });
      await contract.waitForDeployment();

      const address = await contract.getAddress();
      console.log(`[API] Attestation deployed: ${address}`);

      res.json({ address, owner: wallet.address });
    } catch (err) {
      console.error("[API] Deploy failed:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * POST /api/attestation/attest
   *
   * Calls attest() on an already-deployed Attestation contract.
   * The agent wallet must be the contract owner.
   *
   * Body:
   *   contractAddress  — deployed Attestation.sol address
   *   data             — AttestationData struct fields
   *
   * Response: { txHash, blockNumber }
   */
  app.post("/api/attestation/attest", async (req: Request, res: Response) => {
    const { contractAddress, data } = req.body as {
      contractAddress: string;
      data: {
        attester: string;
        token: string;
        approved: boolean;
        reason: string;
        score: number;
        timestamp?: number;
        decisionType: number;
        decisionOrigin: number;
        quorumVotes: number;
        quorumTotal: number;
        nav: number;
        riskScore: number;
        portfolioBreakdown: string;
        yieldHistory: string;
      };
    };

    if (!contractAddress || !data) {
      res.status(400).json({ error: "contractAddress and data are required" });
      return;
    }

    try {
      const wallet = getAttestationWriterWallet();
      const { abi } = loadArtifact();
      const contract = new ethers.Contract(contractAddress, abi, wallet);

      const payload = {
        ...data,
        timestamp: data.timestamp ?? Math.floor(Date.now() / 1000),
      };

      console.log(`[API] attest() on ${contractAddress} — token: ${data.token}`);
      const tx = await contract.attest(payload, { gasLimit: 2_000_000 });
      const receipt = await tx.wait();
      console.log(`[API] Confirmed in block ${receipt.blockNumber}: ${tx.hash}`);

      res.json({ txHash: tx.hash, blockNumber: receipt.blockNumber });
    } catch (err) {
      console.error("[API] attest() failed:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/attestation/:contractAddress/attestations/:token
   *
   * Read all attestations for a token from a deployed Attestation contract.
   * Public — no wallet needed.
   */
  app.get(
    "/api/attestation/:contractAddress/attestations/:token",
    async (req: Request, res: Response) => {
      const { contractAddress, token } = req.params;
      try {
        const wallet = getAttestationWriterWallet();
        const { abi } = loadArtifact();
        const contract = new ethers.Contract(contractAddress as string, abi, wallet.provider);

        const records = await contract.getAttestations(token);
        res.json({ records });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /api/shock
   *
   * Injects a market shock — changes asset risk on VaultLedger.
   * The agent's next OBSERVE cycle will detect the change and react.
   *
   * Body: { asset: "RECV-ACME-90D", newRiskScore: 90, reason: "Credit downgrade" }
   */
  app.post("/api/shock", async (req: Request, res: Response) => {
    const { asset, newRiskScore, newYieldBps, reason } = req.body as {
      asset: string;
      newRiskScore: number;
      newYieldBps?: number;
      reason: string;
    };

    if (!asset || newRiskScore == null || !reason) {
      res.status(400).json({ error: "asset, newRiskScore, and reason are required" });
      return;
    }

    try {
      const result = await injectShock({ asset, newRiskScore, newYieldBps, reason });
      res.json(result);
    } catch (err) {
      console.error("[API] Shock injection failed:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * POST /api/opportunity
   *
   * Introduces a new asset to the vault by registering it on VaultLedger.
   * The agent's next OBSERVE cycle will detect and evaluate it.
   *
   * ERC-20 body: { type: "erc20", tokenAddress: "0x...", symbol: "BOND-HY-3M", riskScore: 45, yieldBps: 900, reason: "New high-yield bond" }
   * ERC-721 body: { type: "erc721", tokenAddress: "0x...", symbol: "ART-MONET-01", riskScore: 35, tokenId: 1, valuationUSD: 30000000, reason: "New painting" }
   */
  app.post("/api/opportunity", async (req: Request, res: Response) => {
    const { type, tokenAddress, symbol, riskScore, yieldBps, tokenId, valuationUSD, reason } = req.body as {
      type: "erc20" | "erc721";
      tokenAddress: string;
      symbol: string;
      riskScore: number;
      yieldBps?: number;
      tokenId?: number;
      valuationUSD?: number;
      reason: string;
    };

    if (!type || !tokenAddress || !symbol || riskScore == null || !reason) {
      res.status(400).json({ error: "type, tokenAddress, symbol, riskScore, and reason are required" });
      return;
    }

    try {
      const result = await injectOpportunity({ type, tokenAddress, symbol, riskScore, yieldBps, tokenId, valuationUSD, reason });
      res.json(result);
    } catch (err) {
      console.error("[API] Opportunity injection failed:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /health
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      agentAddress: (() => {
        try { return getAttestationWriterWallet().address; } catch { return null; }
      })(),
      attestationAddress: config.contracts.attestation || null,
    });
  });

  return app;
}

export function startServer(port = 3001): void {
  const app = createServer();
  app.listen(port, () => {
    console.log(`[API] Server listening on http://localhost:${port}`);
    console.log(`[API]   POST /api/attestation/deploy`);
    console.log(`[API]   POST /api/attestation/attest`);
    console.log(`[API]   GET  /api/attestation/:address/attestations/:token`);
    console.log(`[API]   POST /api/shock`);
    console.log(`[API]   POST /api/opportunity`);
    console.log(`[API]   GET  /health`);
  });
}
