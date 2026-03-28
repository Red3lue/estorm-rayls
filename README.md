# eStorm — Autonomous Treasury Agent

> AI-Managed Tokenized Fund on Rayls

**Track**: Autonomous Institution Agent | **Hackathon**: Rayls #2 — EthCC Cannes, March 28-29, 2026

---

## What Is This?

An AI agent that autonomously manages a tokenized investment fund on a Rayls Private Network.

- **Private portfolio**: RWA assets (bonds, receivables, stablecoins) live on a Privacy Node — fully sovereign, invisible to the outside world
- **Autonomous AI**: Rebalances the portfolio, manages risk, optimizes yield — zero human intervention
- **Public attestation**: Every AI decision is attested on the Rayls Public Chain — investors can verify fund health without seeing the underlying positions
- **Fund shares**: Investors buy share tokens on the Public Chain to get exposure to the private portfolio
- **Revenue model**: Management fee (2% AUM) + Performance fee (20% above hurdle) — same as BlackRock, fully automated on-chain

## Architecture

![Infrastructure Architecture](./architecture.svg)

### How It Works

```
Every cycle:

  1. OBSERVE  → Reads ERC-20 balances + ERC-721 inventory, calculates NAV
  2. THINK    → 4 independent AI agents analyze vault, 3/4 quorum required
  3. GOVERN   → Apply rules: value threshold, asset permissions, rate limits
  4. ATTEST   → Writes decisions to Public Chain (labeled AI_QUORUM / HUMAN_APPROVED)
  5. EXECUTE  → DvP swaps + mint/burn on Privacy Node (private)
  6. ISSUE    → Updates vault share price + mints receipt tokens (public)
```

### What Lives Where

| Layer | Components | Visibility |
|-------|-----------|------------|
| **Privacy Node** | 4 ERC-20 RWAs, 2 ERC-721 art NFTs, VaultLedger.sol, DvP swaps | Private — only the AI agent sees this |
| **Subnet Hub** | Token Registry, governance, DvP settlement | Managed by Rayls — we register tokens here |
| **Public Chain** | Attestation.sol, VaultShareToken.sol, ReceiptToken.sol, Marketplace.sol | Public — investors and anyone can verify |
| **Off-chain** | AI Agent (TypeScript + Claude Code CLI, 4-agent quorum) | Runs alongside Privacy Node in production |

### The Disclosure Design

Investors see:
- NAV (Net Asset Value)
- Risk score (0-100)
- Portfolio yield
- AI reasoning with quorum vote counts
- Vault share price + receipt token certifications
- Decision origin: AI_QUORUM (3/4) or HUMAN_APPROVED

Investors never see:
- Which specific assets the vault holds
- Individual asset amounts or counterparties
- Trading strategy details

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.24, Foundry, `@rayls/contracts` SDK |
| AI Agent | TypeScript, Node.js, ethers.js v6 |
| LLM | Claude Code CLI, local subscription (hackathon) / Local LLM (production) |
| Frontend | React (lightweight dashboard) |
| Chains | Privacy Node (800001), Public Chain (7295799) |

## Project Structure

```
estorm-rayls/
├── contracts/              # Solidity smart contracts
│   ├── privacy-node/       # Deployed to Privacy Node
│   │   ├── tokens/         # ERC-20 RWA tokens + ERC-721 art tokens
│   │   └── VaultLedger.sol
│   └── public-chain/       # Deployed to Public Chain
│       ├── Attestation.sol
│       ├── VaultShareToken.sol
│       ├── ReceiptToken.sol
│       └── Marketplace.sol
├── agent/                  # AI Sovereign Vault Agent
│   ├── modules/
│   │   ├── observe.ts      # Multi-asset vault snapshot
│   │   ├── think.ts        # 4-agent quorum engine
│   │   ├── govern.ts       # Governance rules (threshold, permissions, rate limit)
│   │   ├── attest.ts       # On-chain attestation (with decision origin labels)
│   │   ├── execute.ts      # Governed vault operations
│   │   └── issue.ts        # Vault shares + receipt token management
│   ├── adapters/
│   │   ├── llm.ts          # LLM adapter interface
│   │   └── claude-code.ts  # Claude Code CLI implementation
│   ├── clients/
│   │   ├── privacy-node.ts # Privacy Node RPC client
│   │   ├── public-chain.ts # Public Chain RPC client
│   │   └── backend-api.ts  # Backend API client
│   └── index.ts            # Autonomous loop
├── frontend/               # Dashboard
├── script/                 # Foundry deployment scripts
├── test/                   # Contract tests
├── foundry.toml
├── package.json
└── README.md
```

## Business Case

**Problem**: Institutional funds manage billions privately. Investors have no way to verify AI-driven portfolio decisions without exposing proprietary positions.

**Solution**: Private portfolio management with public attestation. The AI manages assets behind a firewall. Investors verify via on-chain attestations. Fund shares provide liquid exposure.

**Revenue**:
- Management fee: 2% of AUM/year → $20K on $1M fund
- Performance fee: 20% above 5% hurdle → $4.6K on 7.3% return
- Scales linearly with AUM

## Team

**eStorm** — Team 5 — Rayls Hackathon #2

## License

MIT
