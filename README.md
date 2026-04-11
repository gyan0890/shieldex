# ShieldPay - Private Autonomous Payments for AI Agents

> AI agents that pay for services without revealing who they are - while staying provably compliant.

ShieldPay is a privacy-preserving payment relay for AI agents on Stellar. It combines the x402 HTTP payment standard with Zero-Knowledge Privacy Pools so agents can autonomously pay for APIs, enforce spending policies on-chain, and keep their operator's identity hidden from the public blockchain.

---

## The Problem

The x402 standard (Coinbase + Cloudflare, Sept 2025) lets AI agents pay for APIs natively over HTTP - no subscriptions, no credit cards, ~2 second settlement. But every payment is fully transparent on-chain:

- **Business logic exposed** - Competitors see which data sources your agent uses
- **Usage patterns visible** - Anyone can track your agent's frequency and scale
- **Identity linkable** - Agent wallet traces back to the funding source (you)

Agents either use personal wallets (privacy nightmare) or shared hot wallets (no accountability). Neither works.

## The Solution

ShieldPay adds two layers between the agent and the blockchain:

1. **Privacy Pool** - Anonymizes where the money comes from (ZK proofs sever the deposit-to-withdrawal link)
2. **Agent Policy Wallet** - Enforces spending rules on-chain (max per transaction, daily cap, whitelisted recipients)

Result: agents pay autonomously, within enforced rules, without revealing their operator's identity.

---

## Architecture

```
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|   USER/OPERATOR  |     |   PRIVACY POOL    |     |  AGENT POLICY    |
|                  |     |   (Soroban)       |     |  WALLET (Soroban)|
|  Deposits USDC/  +---->+                   +---->+                  |
|  XLM into pool   |     |  ZK proof severs  |     |  Enforces:       |
|  (one-time)      |     |  deposit-withdraw |     |  - max per tx    |
|                  |     |  link             |     |  - daily cap     |
+------------------+     +-------------------+     |  - allowed dests |
                                                   +--------+---------+
                                                            |
                                                            | pay()
                                                            v
+------------------+     +-------------------+     +--------+---------+
|                  |     |                   |     |                  |
|   x402 API       |<----+   MIDDLEWARE      |<----+   AI AGENT       |
|   SERVERS        |     |   (TypeScript)    |     |   (Demo App)     |
|                  |     |                   |     |                  |
|  Weather, Flight,|     |  POST /pay ->     |     |  Travel Planner  |
|  News APIs       |     |  reads policy ->  |     |  autonomously    |
|  Respond to 402  |     |  submits Stellar  |     |  calls APIs      |
|                  |     |  transaction      |     |                  |
+------------------+     +-------------------+     +------------------+
```

### Payment Flow

```
1. USER deposits funds into Privacy Pool (one-time setup)
         |
         v
2. Funds route to Agent Wallet via ZK proof (no identity link)
         |
         v
3. AI Agent encounters paid API (HTTP 402 response)
         |
         v
4. Agent calls middleware: POST /pay { amount, recipient, reason }
         |
         v
5. Middleware reads policy from Agent Wallet contract
         |
         v
6. Contract validates: amount ok? daily cap ok? recipient whitelisted?
         |
    +----+----+
    |         |
   PASS      FAIL
    |         |
    v         v
7a. Payment   7b. Rejection logged
    executes       on-chain, agent
    on Stellar     notified
    |
    v
8. Agent resubmits HTTP request with payment receipt
    |
    v
9. API server fulfills request
```

### On-Chain Privacy

```
What an observer sees:              What they CANNOT see:
+---------------------------+       +---------------------------+
| Agent Wallet: GBxyz...   |       | Who funded this wallet    |
| Paid: GBWEATHER... $0.50 |       | (Privacy Pool breaks link)|
| Paid: GBFLIGHT...  $1.00 |       |                           |
| Paid: GBNEWS...    $0.25 |       | Who the operator is       |
| Policy: max $0.50/tx     |       | (ZK proof, no identity)   |
| Daily cap: $5.00         |       |                           |
+---------------------------+       +---------------------------+
```

---

## How It Works

### 1. Privacy Pool (Soroban Contract)

Adapted from [soroban-privacy-pools](https://github.com/ymcrcat/soroban-privacy-pools). Users deposit USDC/XLM into a shared pool. Withdrawals use ZK proofs (Groth16) to prove the withdrawer deposited *some* amount without revealing *which* deposit is theirs. Funds route directly into the Agent Policy Wallet - never to a personal address.

### 2. Agent Policy Wallet (Soroban Contract)

Stores and enforces spending rules on-chain:

| Rule | What it does |
|------|-------------|
| `max_per_tx` | Caps any single payment (in stroops) |
| `daily_cap` | Caps cumulative 24h spending (in stroops) |
| `allowed_destinations` | Strict whitelist of Stellar addresses the agent can pay |
| `owner` | Only this address can update policy |

On policy breach: payment is blocked, funds stay safe, violation event is emitted on-chain.

### 3. Middleware (TypeScript Service)

REST API that agents call instead of paying directly. Maps human-readable API endpoints to Stellar addresses, checks policy locally for fast rejection, then submits Stellar transactions. Exposes `POST /pay { amount, recipient, reason }`.

### 4. Demo App (Web UI)

"AI Travel Planner" - an agent autonomously paying for weather, flight, and news data. Shows live payment feed, policy limits, and the hack simulation where an attacker tries (and fails) to drain the wallet.

---

## Getting Started

See [DEMO_GUIDE.md](./DEMO_GUIDE.md) for the full setup and walkthrough.

### Quick Start

```bash
# Clone the repo
git clone https://github.com/[org]/shieldpay.git
cd shieldpay

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your Stellar testnet keys (see DEMO_GUIDE.md)

# Deploy contracts to testnet (or use pre-deployed addresses in .env.example)
cd contracts && ./deploy.sh

# Start middleware
cd ../middleware && npm run dev

# Start demo app
cd ../demo-app && npm run dev
# Open http://localhost:3000
```

### Pre-deployed Demo

Live demo: **[Vercel URL TBD after Person C deploys]**

---

## Demo Walkthrough

The demo runs 5 scenarios that show the full system. See [TEST_SCENARIOS.md](./TEST_SCENARIOS.md) for detailed steps.

**The highlight - Hack Simulation:**

1. Agent happily pays small API fees - all within policy
2. "Attacker gains control" - tries sending $10,000 to unknown address
3. Contract rejects - policy breach logged on-chain
4. Attacker traces wallet on Stellar explorer - leads to Privacy Pool - dead end
5. User notification: *"3 policy violations blocked. Your identity was never exposed."*

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Rust / Soroban (Stellar) |
| ZK Proofs | Groth16 via soroban-privacy-pools |
| Middleware | TypeScript / Node.js |
| Demo App | Next.js / React |
| Stablecoin | USDC on Stellar (testnet) |
| Payment Standard | x402 (HTTP 402) |
| Deployment | Vercel (app) / Stellar Testnet (contracts) |

---

## Project Structure

```
shieldpay/
  contracts/
    agent-policy-wallet/    # Soroban contract - spending rules
    privacy-pool/           # Soroban contract - ZK deposit/withdraw
    deploy.sh               # Testnet deployment script
  middleware/
    src/
      server.ts             # POST /pay endpoint
      policy.ts             # Contract state reader
      stellar.ts            # Transaction builder
  demo-app/
    src/
      app/                  # Next.js pages
      components/
        PaymentFeed.tsx      # Live payment activity
        PolicyDisplay.tsx    # Current spending rules
        HackSimulation.tsx   # Attack scenario UI
  docs/
    POLICY_SCHEMA.md        # Contract policy specification
    TEST_SCENARIOS.md        # Demo test scenarios
    DEMO_GUIDE.md           # Setup and run guide
    PITCH_DECK.md           # Presentation content
    RAGEQUIT.md             # Future work spec
```

---

## Future Work

- **ASP-Gated x402 Marketplace** - API providers require ZK compliance proof alongside payment. "This agent's funding passed KYC/AML" without knowing who the agent is.
- **Rage-Quit Withdrawals** - Users can publicly withdraw all unspent funds and exit the system. See [RAGEQUIT.md](./RAGEQUIT.md).
- **Multi-Chain Support** - Extend beyond Stellar to Base, Ethereum L2s where x402 is also active.
- **Real x402 Server Integration** - Replace mock APIs with live x402-enabled endpoints as the ecosystem grows.
- **Cooldown Periods** - Anti-drain rate limiting at the contract level.
- **Multi-Asset Policies** - Per-currency spending rules (separate limits for USDC vs XLM).

---

## Team

| Role | Person | Owns |
|------|--------|------|
| Blockchain Engineer | Person A | Soroban contracts (Policy Wallet + Privacy Pool) |
| Agent Middleware | Person B | TypeScript payment service |
| Demo Application | Person C | Web UI + demo scenarios |
| Docs, Pitch & Glue | Person D | README, architecture, pitch deck, test plan |

---

## References

- [x402 Protocol](https://www.x402.org/) - HTTP-native payment standard
- [soroban-privacy-pools](https://github.com/ymcrcat/soroban-privacy-pools) - Stellar Privacy Pools implementation
- [Stellar Soroban Docs](https://soroban.stellar.org/docs) - Smart contract platform
- [Google A2A + x402](https://developers.google.com/agent-to-agent) - Agent2Agent protocol with x402 extension
- [Privacy Pools Paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364) - Buterin et al., 2023

---

*Built at [Hackathon Name] - April 2026*
