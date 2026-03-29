import express, { Request, Response } from "express";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getPublicChainWallet } from "../clients/publicChain.js";
import { config } from "../config/index.js";

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
      const wallet = getPublicChainWallet();
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
      const wallet = getPublicChainWallet();
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
        const wallet = getPublicChainWallet();
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
   * GET /health
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      agentAddress: (() => {
        try { return getPublicChainWallet().address; } catch { return null; }
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
    console.log(`[API]   GET  /health`);
  });
}
