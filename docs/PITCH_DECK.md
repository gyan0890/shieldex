# ShieldPay - Pitch Deck

**5 slides. ~5 minutes. Tell the story.**

---

## Slide 1: THE PROBLEM

**Title:** AI Agents Can Pay - But Everyone's Watching

**Visual layout:** Split screen. Left: an agent making API calls with a green "payment successful" flow. Right: a blockchain explorer showing every transaction in public, with red highlight boxes around wallet addresses, amounts, timestamps.

**Content:**

x402 (Coinbase + Cloudflare, 2025) solved autonomous agent payments. Agents pay APIs natively over HTTP. 2-second settlement. No credit cards.

But every payment is fully transparent on-chain.

- Your competitors see which data sources your agent uses
- Anyone tracks your agent's frequency and scale
- Your agent's wallet traces back to you

And there's no spending control. A compromised agent can drain its entire wallet in seconds.

**Two unsolved problems: privacy and control.**

**Speaker notes:**
"x402 is a breakthrough - it lets AI agents pay for services the way they browse the web. But it has a surveillance problem. Every payment your agent makes is on a public blockchain. Your competitors can see your agent's playbook. And if someone compromises your agent, there's nothing stopping it from draining every dollar. We built ShieldPay to fix both."

---

## Slide 2: THE SOLUTION

**Title:** ShieldPay - Private, Policy-Enforced Agent Payments

**Visual layout:** Three-layer diagram, stacked vertically with icons:
- Top layer (shield icon): Privacy Pool - "Anonymous funding"
- Middle layer (lock icon): Agent Policy Wallet - "Spending rules on-chain"
- Bottom layer (zap icon): x402 Middleware - "Autonomous payments"

**Content:**

Three layers that work together:

**Privacy Pool** (Soroban/Stellar)
- User deposits funds once. ZK proof severs the identity link.
- Agent wallet gets funded. Nobody knows by whom.

**Agent Policy Wallet** (Soroban/Stellar)
- Max per transaction. Daily spending cap. Whitelisted destinations only.
- Enforced on-chain. Not in application code. Not bypassable.

**x402 Middleware** (TypeScript)
- Agent encounters HTTP 402. Middleware handles payment through the policy wallet.
- Zero human involvement after setup.

**Speaker notes:**
"ShieldPay has three layers. At the bottom, agents pay for APIs using the x402 standard - completely autonomous. In the middle, a smart contract enforces spending rules - max 50 cents per call, max 5 dollars per day, only approved recipients. At the top, a privacy pool anonymizes where the money comes from using zero-knowledge proofs. The result: your agent pays for what it needs, within rules you set, and nobody on the blockchain can figure out who you are."

---

## Slide 3: ARCHITECTURE

**Title:** How It Works

**Visual layout:** Horizontal flow diagram with 5 steps, color-coded. Green for user actions, blue for contract logic, purple for ZK proofs.

```
[User] --deposit--> [Privacy Pool] --ZK withdraw--> [Agent Wallet]
                                                          |
                                                      enforces policy
                                                          |
[x402 API] <--payment-- [Middleware] <--POST /pay-- [AI Agent]
```

**Content:**

1. **Fund** - User deposits USDC into Privacy Pool (one-time)
2. **Anonymize** - ZK proof routes funds to Agent Wallet (no identity link)
3. **Act** - Agent encounters paid API, calls middleware
4. **Enforce** - Contract checks: amount ok? cap ok? recipient approved?
5. **Pay** - Transaction executes on Stellar (~2 sec, ~$0.0001 fee)

Built on:
- **Stellar/Soroban** - Smart contracts with ~2 sec finality
- **Groth16 ZK proofs** - Privacy without sacrificing compliance
- **x402 standard** - HTTP-native payments (Coinbase + Cloudflare)

**Speaker notes:**
"Let me walk through the actual flow. A user deposits, say, $100 USDC into the privacy pool. A zero-knowledge proof routes those funds into an agent wallet - and that ZK proof is the key, because it proves the funds came from a legitimate deposit without revealing which one. Now the agent goes to work. It hits an API, gets an HTTP 402 - payment required. Our middleware reads the spending policy from the smart contract, validates the payment is within bounds, and submits the Stellar transaction. Two seconds later, the agent has its data. On the blockchain, you see the agent wallet paid an API. You cannot see who funded that wallet. That's the entire point."

---

## Slide 4: LIVE DEMO - THE HACK

**Title:** What Happens When Your Agent Gets Compromised?

**Visual layout:** Dark background. Terminal/UI mockup. Four sequential panels, each revealing the next.

**Panel 1 - Normal operation (green):**
```
Agent -> Weather API    $0.50  APPROVED
Agent -> Flight API     $1.00  APPROVED
Agent -> News API       $0.25  APPROVED
Daily spend: $1.75 / $5.00
```

**Panel 2 - Attack begins (red):**
```
ATTACKER -> Unknown addr  $10,000  BLOCKED (exceeds $0.50/tx cap)
ATTACKER -> Unknown addr  $0.50    BLOCKED (recipient not whitelisted)
ATTACKER -> Weather API   $0.25    APPROVED (within all rules)
ATTACKER -> Weather API   $0.25    APPROVED
...
ATTACKER -> Weather API   $0.25    BLOCKED (daily cap $5.00 reached)
```

**Panel 3 - Attacker investigates (yellow):**
```
Agent wallet: GBxyz...
Funded by: Privacy Pool contract
Which deposit? [ZK PROOF - NO LINK FOUND]
Operator identity: UNKNOWN
```

**Panel 4 - User notification (blue):**
```
ShieldPay Alert:
3 policy violations blocked in 60 seconds.
Daily cap reached. Agent paused.
Maximum possible loss: $5.00
Your identity: never exposed.
```

**Speaker notes:**
"This is the moment. The agent is compromised. An attacker tries to drain $10,000 - blocked, exceeds the 50-cent cap. Tries a small amount to an unauthorized address - blocked, not whitelisted. Tries rapid small payments to a legit address - gets a few through, then hits the daily cap. Total damage: at most $5. Now the attacker looks at the blockchain. They see the wallet address. They trace the funding - it leads to the privacy pool. Dead end. They cannot determine who owns this agent. The user gets a notification: three violations blocked, identity never exposed. That's ShieldPay."

---

## Slide 5: WHAT'S NEXT

**Title:** From Hackathon to Infrastructure

**Visual layout:** Roadmap as three columns: NOW (green) / NEXT (blue) / FUTURE (purple)

**NOW (this hackathon):**
- Privacy Pool + Agent Policy Wallet on Stellar testnet
- x402 payment middleware
- Demo app with hack simulation
- Proof of concept: private, policy-enforced agent payments

**NEXT (3-6 months):**
- **ASP-Gated x402 Marketplace** - API providers require ZK compliance proof with payment. "This agent passed KYC" without revealing who it is. Premium financial and legal APIs adopt this.
- **Rage-Quit Withdrawals** - Users exit the system cleanly, withdrawing unspent funds with privacy-preserving denomination controls.
- **Multi-chain** - Extend to Base and Ethereum L2s where x402 ecosystem is also growing.

**FUTURE (the big picture):**
- Google's A2A protocol already integrates x402. As agentic commerce scales to McKinsey's projected $3-5 trillion by 2030, every agent-to-agent payment needs privacy and policy enforcement. ShieldPay becomes the compliance-preserving privacy layer for the entire x402 ecosystem.

**Speaker notes:**
"What we built this weekend is a working proof of concept. But the real play is bigger. x402 is being adopted - Google's Agent2Agent protocol already integrates it. As AI agents start mediating trillions in commerce, every single one of those payments will need two things: privacy, so competitors can't watch your agent's every move, and policy enforcement, so a compromised agent can't drain your wallet. ShieldPay is that layer. We're starting on Stellar, expanding to every chain where x402 lives."

---

## Delivery Notes

**Timing:**
- Slide 1: 45 seconds (set up the problem fast)
- Slide 2: 60 seconds (solution overview)
- Slide 3: 60 seconds (technical credibility)
- Slide 4: 90 seconds (this is the main event - take your time)
- Slide 5: 45 seconds (close with ambition)
- Total: ~5 minutes, leaves 3-5 min for Q&A

**First 10 seconds hook:**
Open with: "Your AI agent just paid for 500 API calls today. Every single one is on a public blockchain. Your competitors know your entire playbook." - Then pause. Let it land.

**Likely judge questions and answers:**
- "Why not just use a VPN/mixer?" - Mixers don't provide compliance proofs. Privacy Pools let you prove your funds are clean without revealing your identity. This is privacy WITH compliance, not privacy vs. compliance.
- "Why Stellar?" - 2-second finality, sub-cent fees, Soroban supports ZK verification, existing privacy pool implementation to build on. x402 is chain-agnostic so we can expand.
- "How does this scale with high-frequency micropayments?" - ZK proofs are expensive (~40% of Soroban instruction budget). That's why we batch: many transparent payments flow through the agent wallet; only periodic pool top-ups need ZK proofs.
- "What if the operator is malicious?" - The policy is on-chain and transparent. Anyone can audit the rules. The privacy protects identity, not behavior.
