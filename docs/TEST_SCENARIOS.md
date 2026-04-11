# Test Scenarios - Live Demo Script

**Purpose:** Five scenarios to run during judging. Each demonstrates a different aspect of the system. Run them in order - they build a narrative.

**Pre-demo checklist:**
- [ ] Contracts deployed to Stellar testnet (addresses in `.env`)
- [ ] Middleware running (`POST /pay` responding)
- [ ] Demo app open in browser
- [ ] Stellar testnet explorer open in a second tab (stellar.expert or stellarchain.io)
- [ ] Agent wallet funded via Privacy Pool (minimum $10 testnet USDC)
- [ ] Policy set: max_per_tx = 5,000,000 stroops ($0.50), daily_cap = 50,000,000 stroops ($5.00), 3 whitelisted destinations

---

## Scenario 1: Happy Path - Agent Pays for APIs

**What it proves:** The basic payment flow works end-to-end.

**Preconditions:**
- Agent wallet has sufficient funds
- Policy is set with 3 whitelisted API destinations
- Daily spend is at $0.00

**Steps:**
1. Click "Start Agent" in demo app
2. Agent requests weather data - encounters HTTP 402
3. Agent calls middleware - middleware checks policy - payment executes
4. Agent requests flight data - same flow
5. Agent requests news data - same flow

**Expected result:**
- Three successful payments: $0.50, $1.00, $0.25
- Live feed shows all three with green checkmarks
- Running daily total updates: $0.00 -> $0.50 -> $1.50 -> $1.75
- Each payment visible on Stellar explorer

**What to show judges:**
- The live payment feed updating in real-time
- Policy panel showing spend within limits
- "This is an AI agent autonomously paying for services - no human in the loop"

**If something breaks:**
- Middleware not responding: restart with `npm run dev`, retry
- Transaction fails: check testnet funds with `stellar account info [address]`
- UI not updating: hard refresh, check WebSocket/polling connection

---

## Scenario 2: Policy Breach - Amount Exceeds Cap

**What it proves:** The contract enforces per-transaction limits.

**Preconditions:**
- Scenario 1 completed (agent has made successful payments)
- Policy max_per_tx = $0.50

**Steps:**
1. Click "Simulate Expensive API Call" in demo app
2. Agent tries to pay $50.00 (100x the cap) for a "premium financial dataset"
3. Middleware submits transaction to contract
4. Contract rejects - max_per_tx violated

**Expected result:**
- Payment BLOCKED
- Live feed shows red entry: "POLICY BREACH: amount $50.00 exceeds max $0.50/tx"
- Funds remain unchanged in wallet
- Breach event emitted on-chain (visible in explorer)

**What to show judges:**
- The red rejection in the feed vs the green successes from Scenario 1
- "The agent wanted to pay $50 for premium data, but the policy caps it at 50 cents. Not a single stroop left the wallet."

**If something breaks:**
- If payment accidentally succeeds: policy wasn't set correctly, redeploy contract with correct max_per_tx
- If no rejection event: check contract event emission logic with Person A

---

## Scenario 3: Policy Breach - Unauthorized Recipient

**What it proves:** The contract enforces destination whitelisting.

**Preconditions:**
- Policy has exactly 3 allowed destinations
- Have a non-whitelisted Stellar address ready

**Steps:**
1. Click "Pay Unknown Service" in demo app
2. Agent tries to pay $0.25 (under the cap) to an address NOT on the whitelist
3. Contract rejects - recipient not in allowed_destinations

**Expected result:**
- Payment BLOCKED
- Live feed shows red entry: "POLICY BREACH: recipient GBxyz... not in allowed destinations"
- Amount was fine, but destination was wrong
- Funds untouched

**What to show judges:**
- "Even though the amount was tiny and within policy, the contract blocked it because the destination wasn't pre-approved. This is defense in depth - both amount AND recipient must be valid."

**If something breaks:**
- If payment goes through: whitelist is misconfigured, verify allowed_destinations array in contract state
- Use `soroban contract invoke --id [wallet] -- get_policy` to verify on-chain state

---

## Scenario 4: Hack Simulation - The Killer Demo Moment

**What it proves:** The entire security model working together - policy enforcement + privacy protection.

**Preconditions:**
- Scenarios 1-3 completed (judges have seen normal operation and individual breaches)
- Stellar explorer open in second tab

**Steps:**

**Phase 1 - The Attack:**
1. Narrate: "The agent has been compromised. An attacker now controls it."
2. Click "Simulate Hack" button
3. Attacker attempt #1: `pay($10,000, ATTACKER_WALLET, "drain")` - BLOCKED by max_per_tx
4. Attacker attempt #2: `pay($0.50, ATTACKER_WALLET, "small drain")` - BLOCKED by allowed_destinations
5. Attacker attempt #3: Rapid $0.25 payments to whitelisted addr - succeeds a few times, then BLOCKED by daily_cap
6. Live feed shows: 2 red blocks, then a few greens, then red again when cap hits

**Phase 2 - The Privacy Wall:**
7. Switch to Stellar explorer tab
8. Show the agent wallet address - attacker can see this
9. Trace funding source - it leads to the Privacy Pool contract, NOT a personal wallet
10. "The attacker knows the agent's address, but cannot determine who funds it. Dead end."

**Phase 3 - The Notification:**
11. Show the owner notification in the UI: "3 policy violations blocked in the last 60 seconds. Daily cap reached. Your identity was never exposed."

**Expected result:**
- Multiple breach events logged
- Maximum damage limited to whatever was under the daily cap (at most $5.00)
- On-chain trace leads to Privacy Pool - no identity leak
- Notification summarizes the incident

**What to show judges:**
- "The attacker had full control of the agent. Worst case damage: $5. They tried to drain $10,000 - blocked. They tried unauthorized addresses - blocked. And after all that, they have zero idea who owns this agent. That's ShieldPay."

**If something breaks:**
- If the explorer doesn't show the Privacy Pool link clearly: have a pre-prepared screenshot showing the funding trace as backup
- If daily_cap breach doesn't trigger (not enough prior spend): adjust scenario timing or manually add prior payments

---

## Scenario 5: Anonymous Top-Up

**What it proves:** The privacy layer - funds enter the agent wallet with no identity trace.

**Preconditions:**
- A separate "user" wallet with testnet USDC
- Privacy Pool contract deployed
- Agent wallet exists but needs more funds

**Steps:**
1. Narrate: "The operator wants to add more funds to the agent. But they don't want to link their identity to the agent on-chain."
2. Show the Privacy Pool deposit: User sends $20 USDC into the pool
3. Wait for confirmation
4. Execute ZK withdrawal: funds route from pool to Agent Wallet
5. Show on Stellar explorer: agent wallet received funds
6. Try to trace backward: where did the funds come from? The Privacy Pool. Which deposit? ZK proof reveals nothing.

**Expected result:**
- Agent wallet balance increases by $20
- On explorer: withdrawal transaction shows Privacy Pool -> Agent Wallet
- No link between the deposit (step 2) and the withdrawal (step 4) visible on-chain

**What to show judges:**
- Two explorer views side by side: "Here's the deposit. Here's the withdrawal. There is no on-chain link between them. That's the ZK proof at work."

**If something breaks:**
- ZK proof generation is slow: have a pre-generated proof ready as backup
- If the proof verification fails on testnet (known ~40% instruction budget issue): explain this is why we batch - show the architecture slide explaining batched withdrawals as the production model
- If explorer is down: use `stellar contract events` CLI to show the same data in terminal

---

## Timing Guide

| Scenario | Duration | Running Total |
|----------|----------|---------------|
| 1. Happy Path | ~1 min | 1 min |
| 2. Amount Breach | ~30 sec | 1.5 min |
| 3. Recipient Breach | ~30 sec | 2 min |
| 4. Hack Simulation | ~2 min | 4 min |
| 5. Anonymous Top-Up | ~1 min | 5 min |

Total demo: ~5 minutes. Leaves time for Q&A in a standard 8-10 minute slot.

---

## Narrative Arc

The demo tells a story:

1. **"Everything works"** - Agent pays happily, judges see the basic flow
2. **"Rules are enforced"** - Individual policy checks work
3. **"Even more rules"** - Multiple layers of protection
4. **"Everything breaks - but the system holds"** - The moment judges remember
5. **"And nobody knows who you are"** - The privacy punchline

Don't just click buttons. Tell the story.
