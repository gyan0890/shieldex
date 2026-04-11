# Rage-Quit Flow - Future Work Specification

**Status:** Proposed (not implemented in hackathon build)
**Purpose:** Defines how a user cleanly exits the system and withdraws all unspent funds.

---

## Problem

Once a user deposits into the Privacy Pool and funds an agent wallet, there's no documented way to get remaining funds back. If a user wants to stop using the system entirely, they need a "rage-quit" - a full withdrawal that:

1. Returns all unspent funds to the user
2. Deactivates the agent wallet
3. Preserves as much privacy as possible during exit

The Stellar Privacy Pools article flags this as future work. This spec defines the mechanism.

---

## Proposed Flow

```
1. User calls rage_quit(destination_address, zk_proof) on Agent Wallet contract

2. Contract checks:
   - Caller is the owner (from policy)
   - No pending transactions in flight
   - ZK proof is valid (proves ownership of pool deposit)

3. Contract actions:
   - Transfers entire remaining balance to destination_address
   - Sets all policy fields to zero (max_per_tx = 0, daily_cap = 0)
   - Clears allowed_destinations
   - Emits "WALLET_DEACTIVATED" event
   - Nullifies all remaining commitments in the pool

4. Post-quit state:
   - Agent wallet exists on-chain but is inert (zero policy = all payments blocked)
   - User has funds back
   - Pool commitments are nullified (cannot be double-spent)
```

---

## Privacy Tradeoff

The rage-quit is the one moment where privacy degrades. When a user withdraws everything at once, the withdrawal amount reveals information:

- **Deposited $100, spent $23 through agent, rage-quit for $77** - An observer who sees both the $100 deposit and $77 withdrawal can correlate them with reasonable confidence (the $23 gap matches the agent wallet's total outflows).

### Mitigations

**Fixed-denomination withdrawals:**
Instead of withdrawing the exact remaining balance, the user withdraws in fixed chunks (e.g., $10 increments). Remaining dust stays in the pool. This makes correlation harder because many deposits could map to any set of $10 withdrawals.

```
Instead of: withdraw($77) -- highly correlatable
Do:         withdraw($10) x 7, forfeit $7 dust -- harder to link
```

Tradeoff: user loses the remainder (up to one denomination unit).

**Delayed withdrawal:**
Don't withdraw all chunks at once. Space them over hours or days. Each withdrawal mixes with other pool activity happening in between.

```
Day 1: withdraw($10)
Day 2: withdraw($10)
Day 3: withdraw($10)
...
```

Tradeoff: slower exit. User has funds locked for longer.

**Decoy withdrawals:**
The pool contract could periodically execute null withdrawals (zero-value or self-transfers) to create noise. Observer sees many withdrawals and can't distinguish real exits from decoys.

Tradeoff: uses on-chain resources, adds complexity.

### Recommended approach for V2

Fixed-denomination withdrawals with optional delay. The denomination should match the pool's deposit denomination (if deposits are in $10 increments, withdrawals should be too). This is the simplest approach that meaningfully improves privacy without over-engineering.

---

## Edge Cases

**What if the agent wallet has pending transactions?**
Rage-quit should fail if any transaction is in-flight. The user must wait for pending operations to settle. Alternative: add a `freeze()` function that blocks new payments but lets pending ones complete, then rage-quit after drain.

**What if the pool has been drained by other withdrawals?**
The agent wallet holds its own balance independent of the pool. Rage-quit withdraws from the wallet, not the pool. The pool is only involved if the user has un-withdrawn pool deposits (deposited but never routed to agent wallet).

**What if the user lost their owner key?**
Funds are locked permanently. This is the standard self-custody tradeoff. Future work could add a time-locked recovery address set at wallet creation.

**What about the on-chain agent wallet history?**
The wallet's payment history remains on-chain permanently. Rage-quit withdraws funds but doesn't erase history. The privacy pool still protects the identity link - even after exit, observers can't connect the wallet to the original depositor (assuming proper ZK withdrawal was used during funding).

---

## Contract Interface (Proposed)

```rust
// Person A would implement this in a future version

pub fn rage_quit(
    env: Env,
    destination: Address,    // Where to send remaining funds
    zk_proof: BytesN<256>,   // Proof of pool membership (for nullification)
) -> Result<u128, Error> {
    // 1. Verify caller is owner
    // 2. Verify no pending transactions
    // 3. Transfer balance to destination
    // 4. Zero out all policy fields
    // 5. Nullify pool commitments
    // 6. Emit WALLET_DEACTIVATED event
    // Returns: amount withdrawn (in stroops)
}
```

---

## Why This Matters for Judges

Including rage-quit as a documented future spec shows:

1. **We understand the full lifecycle** - not just "agent pays things" but the entire deposit-use-exit flow
2. **We've thought about privacy tradeoffs honestly** - exits leak information, and we have concrete mitigations
3. **The system is designed for real users** - people need an exit ramp, not just an on-ramp
4. **This is a spec, not vaporware** - concrete enough that Person A could implement it in a follow-up sprint
