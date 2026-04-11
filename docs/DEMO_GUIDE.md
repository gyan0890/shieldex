# How to Run the Demo

**Time to run: ~2 minutes from clone to working demo.**

---

## Option 1: Live Deployed App (Recommended for Judges)

**URL:** [TBD - Person C deploys to Vercel]

No setup needed. Open the URL and follow the on-screen walkthrough. The app connects to pre-deployed contracts on Stellar testnet.

---

## Option 2: Run Locally

### Prerequisites

- Node.js 18+
- Rust + Soroban CLI (only if redeploying contracts)
- A Stellar testnet account with test USDC ([friendbot](https://friendbot.stellar.org) for XLM)

### Step 1: Clone and Install

```bash
git clone https://github.com/[org]/shieldpay.git
cd shieldpay
npm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

The `.env.example` ships with pre-deployed testnet contract addresses. You only need to change these if you're redeploying.

```env
# Pre-deployed testnet contracts (default - no changes needed)
AGENT_WALLET_CONTRACT=CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PRIVACY_POOL_CONTRACT=CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Agent keypair (testnet - safe to use as-is for demo)
AGENT_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AGENT_PUBLIC_KEY=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Middleware
MIDDLEWARE_PORT=3001
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

### Step 3: Start the Middleware

```bash
cd middleware
npm run dev
# Should see: "Middleware running on http://localhost:3001"
```

### Step 4: Start the Demo App

Open a second terminal:

```bash
cd demo-app
npm run dev
# Should see: "Ready on http://localhost:3000"
```

### Step 5: Open and Run

1. Open http://localhost:3000
2. The app has a guided walkthrough - click "Start Demo"
3. Run through the 5 scenarios (see [TEST_SCENARIOS.md](./TEST_SCENARIOS.md))

---

## Redeploying Contracts (Optional)

Only needed if you want fresh contract instances. Requires Rust and Soroban CLI.

```bash
# Install Soroban CLI
cargo install soroban-cli

# Fund a deployer account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# Build and deploy
cd contracts
./deploy.sh
# Outputs new contract addresses - copy into .env
```

---

## If Something Breaks

**"Middleware not responding"**
- Check it's running on port 3001: `curl http://localhost:3001/health`
- Check `.env` has valid contract addresses
- Restart: `cd middleware && npm run dev`

**"Transaction failed"**
- Agent wallet might be out of testnet funds
- Check balance: `stellar contract invoke --id $AGENT_WALLET_CONTRACT -- get_balance`
- Refund via Privacy Pool deposit or direct testnet transfer for debugging

**"ZK proof verification failed"**
- Known issue: Groth16 verification uses ~40% of Soroban's testnet instruction budget
- For demo: use a pre-generated proof (included in `contracts/fixtures/`)
- Explain to judges: "In production, proofs are batched - this is the testnet limitation we documented"

---

## Demo Flow Cheat Sheet

For the presenter running the demo live:

| Step | Action | What Judges See |
|------|--------|-----------------|
| 1 | Click "Start Agent" | Agent makes 3 API payments, all green |
| 2 | Click "Expensive Call" | Red rejection - amount too high |
| 3 | Click "Unknown Service" | Red rejection - recipient not approved |
| 4 | Click "Simulate Hack" | Multiple attacks, all blocked, privacy wall shown |
| 5 | Click "Top Up Agent" | Anonymous funding via Privacy Pool |

**Total time: ~5 minutes**

If the live demo fails, the app includes a "Replay Mode" that shows pre-recorded transaction data with the same UI - switch to it with the toggle in the top-right corner.
