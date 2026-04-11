# Agent Policy Wallet - Schema Specification

**Status:** LOCKED - Do not rename fields. Additions require Person A sign-off.
**Last updated:** 2026-04-11
**Owner:** Person D

---

## Purpose

This document defines the spending policy schema stored on-chain in the Agent Policy Wallet Soroban contract. Person A implements this as a contract struct. Person B reads these values from contract state to enforce policy in middleware. Person C uses the example config to wire up the demo UI.

**Scope boundary:** This schema covers what the *contract* enforces on-chain. URL/domain-level filtering (e.g. "only pay api.weather.com") is middleware-layer logic owned by Person B - it is NOT part of this schema.

---

## Schema Definition

```json
{
  "max_per_tx": "<integer, stroops>",
  "daily_cap": "<integer, stroops>",
  "allowed_destinations": ["<Stellar address string>", "..."],
  "owner": "<Stellar address string>"
}
```

### Field Specification

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `max_per_tx` | `i128` | Maximum amount (in stroops) the agent can spend in a single `pay()` call | Must be > 0. 1 XLM = 10,000,000 stroops. |
| `daily_cap` | `i128` | Maximum cumulative spend (in stroops) within a rolling 24-hour window | Must be >= `max_per_tx`. Contract tracks rolling spend using on-chain ledger timestamps. |
| `allowed_destinations` | `Vec<Address>` | Strict whitelist of Stellar addresses (public keys or contract addresses) the agent is permitted to pay | Exact match only. No wildcards, no patterns, no URLs. Empty array = all payments blocked. |
| `owner` | `Address` | The Stellar address that controls this policy. Only this address can call `update_policy()`. | Single address. This is the human operator, not the agent. |

### Unit: Stroops

All monetary values are in **stroops** (1 XLM = 10,000,000 stroops, 1 USDC = 10,000,000 stroops on Stellar). This avoids floating-point issues on-chain.

Quick reference:
- $0.50 ~ 5,000,000 stroops
- $1.00 ~ 10,000,000 stroops
- $50.00 ~ 500,000,000 stroops
- $500.00 ~ 5,000,000,000 stroops

---

## Contract Functions This Schema Affects

For Person A's reference - the schema maps to these contract interactions:

**`pay(amount, recipient, memo)`** - Before releasing funds, checks:
1. `amount <= max_per_tx` - reject if single payment exceeds cap
2. `rolling_24h_spend + amount <= daily_cap` - reject if daily limit would be breached
3. `recipient IN allowed_destinations` - reject if destination not whitelisted

**`update_policy(new_max_per_tx, new_daily_cap, new_allowed_destinations)`** - Only callable by `owner`. Overwrites policy fields.

**Policy breach behavior:** On rejection, the contract should:
- NOT transfer any funds
- Emit an event/log with: timestamp, attempted amount, attempted recipient, which rule was violated
- This event data is what Person C displays in the "Policy Breach Attempt" UI

---

## Example Policy: AI Travel Planner (Demo Default)

This is the concrete config Person B and Person C should build against.

```json
{
  "max_per_tx": 5000000,
  "daily_cap": 50000000,
  "allowed_destinations": [
    "GBWEATHERAPI4X402TESTNETADDRESS000000000000000000",
    "GBFLIGHTDATAAPI4X402TESTNETADDR000000000000000000",
    "GBNEWSAPIFORX402DEMOTESTNETADDR000000000000000000"
  ],
  "owner": "GDOPERATOROWNERTESTNETADDRESS00000000000000000000"
}
```

**What this means in human terms:**
- Agent can spend max $0.50 per API call
- Agent can spend max $5.00 per day total
- Agent can only pay three pre-approved API endpoints (weather, flight data, news)
- Only the operator can change these rules

**For the demo hack simulation:** The "attacker" will try:
1. `pay(100000000000, ATTACKER_ADDR, "drain")` - Fails `max_per_tx` (attempted $10,000 vs $0.50 cap)
2. `pay(5000000, ATTACKER_ADDR, "small drain")` - Fails `allowed_destinations` (attacker address not whitelisted)
3. Rapid small payments to whitelisted addr - Fails `daily_cap` after $5.00 cumulative

---

## What This Schema Does NOT Cover

These are explicitly out of scope for the contract. Flagging here so nobody builds the wrong thing:

- **URL/domain filtering** - The contract sees Stellar addresses, not URLs. Person B's middleware maps "api.weather.com" to its Stellar payment address before calling `pay()`.
- **Per-currency limits** - V1 assumes a single asset (USDC or XLM). Multi-asset support is future work.
- **Cooldown periods** - Discussed in early design. Decided against for V1 to keep the contract simple. Can be added later without changing existing fields.
- **Blocked recipients (blacklist)** - The whitelist (`allowed_destinations`) is the security model. If it's not on the list, it's blocked. No separate blacklist needed.

If any of these become requirements mid-build, flag to Person A BEFORE implementation - adding fields is fine, but changing `allowed_destinations` semantics after `pay()` is implemented costs real time.

---

## For Each Team Member

**Person A:** Implement this as a Soroban struct. The four fields are locked. If you need to add internal tracking fields (e.g. `rolling_spend`, `last_reset_timestamp`), those are implementation details - go ahead. But the four policy fields above are the public interface.

**Person B:** Your middleware reads these fields from contract state. When an agent calls `POST /pay`, you check policy locally first (fast rejection) then submit the Stellar transaction. The contract double-checks on-chain. Your layer adds URL-to-address mapping that the contract can't do.

**Person C:** The demo UI should display `max_per_tx` and `daily_cap` as dollar values (divide stroops by 10,000,000). The "Policy Breach Attempt" button triggers the three attack scenarios described above. Show the contract rejection events in a live feed.
