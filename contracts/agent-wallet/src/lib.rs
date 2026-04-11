#![no_std]
#![allow(deprecated)] // events().publish() is deprecated in favour of #[contractevent]; fine for V1

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, BytesN, Env,
    String, Symbol, Vec,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Payment amount exceeds Policy.max_per_tx
    ExceedsMaxPerTx = 1,
    /// Payment would push rolling-24h spend past Policy.daily_cap
    ExceedsDailyCap = 2,
    /// Recipient address is not in Policy.allowed_destinations
    RecipientNotAllowed = 3,
    /// Caller is not authorised (not the agent or not the owner)
    Unauthorized = 4,
    /// Contract token balance is lower than the requested amount
    InsufficientBalance = 5,
    /// daily_cap < max_per_tx in proposed policy update
    InvalidPolicy = 6,
}

// ---------------------------------------------------------------------------
// Policy struct  (matches POLICY_SCHEMA.md — field names are the public API)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct Policy {
    /// Maximum amount (stroops) the agent may spend in a single pay() call.
    pub max_per_tx: i128,
    /// Maximum cumulative spend (stroops) within any rolling 24-hour window.
    pub daily_cap: i128,
    /// Exact-match whitelist of Stellar addresses the agent may pay.
    /// Empty list = all payments blocked.
    pub allowed_destinations: Vec<Address>,
    /// The human operator who controls policy updates. NOT the agent.
    pub owner: Address,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const POLICY_KEY: Symbol = symbol_short!("policy");
const AGENT_KEY: Symbol = symbol_short!("agent");
const TOKEN_KEY: Symbol = symbol_short!("token");
/// Cumulative spend in the current rolling window (i128 stroops).
const SPENT_KEY: Symbol = symbol_short!("spent");
/// Ledger timestamp (u64) when the current 24h window started.
const RESET_KEY: Symbol = symbol_short!("reset");
/// Monotonic spend counter used to derive unique nullifier hashes (u64).
const NONCE_KEY: Symbol = symbol_short!("nonce");

// Rolling window length in seconds.
const WINDOW: u64 = 86_400;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct AgentWalletContract;

#[contractimpl]
impl AgentWalletContract {
    /// Deploy and configure the agent wallet.
    ///
    /// # Arguments
    /// * `agent`  - The AI agent's Stellar address. Only this address may call `pay()`.
    /// * `token`  - The SAC token this wallet holds and spends (e.g. USDC or XLM).
    /// * `policy` - Initial spending policy (policy.owner becomes the admin).
    pub fn __constructor(env: &Env, agent: Address, token: Address, policy: Policy) {
        // Validate: daily_cap must be >= max_per_tx
        assert!(
            policy.daily_cap >= policy.max_per_tx,
            "daily_cap must be >= max_per_tx"
        );

        env.storage().instance().set(&AGENT_KEY, &agent);
        env.storage().instance().set(&TOKEN_KEY, &token);
        env.storage().instance().set(&POLICY_KEY, &policy);
        env.storage().instance().set(&SPENT_KEY, &0_i128);
        env.storage().instance().set(&RESET_KEY, &env.ledger().timestamp());
        env.storage().instance().set(&NONCE_KEY, &0_u64);
    }

    // -----------------------------------------------------------------------
    // Core spend function
    // -----------------------------------------------------------------------

    /// Make a payment on behalf of the agent.
    ///
    /// Enforces all three policy rules atomically. On success, emits a `spend`
    /// event containing the spend nullifier so operators can audit without
    /// tracing back to the depositor. On policy breach, emits a `breach` event
    /// with the violated rule and returns an error — no funds are moved.
    ///
    /// # Arguments
    /// * `amount`    - Stroops to transfer.
    /// * `recipient` - Destination address (must be in `allowed_destinations`).
    /// * `memo`      - Arbitrary string for off-chain audit logs.
    ///
    /// # Returns
    /// A 32-byte spend nullifier hash unique to this payment.
    pub fn pay(
        env: &Env,
        amount: i128,
        recipient: Address,
        memo: String,
    ) -> Result<BytesN<32>, Error> {
        // Only the designated agent may spend.
        let agent: Address = env.storage().instance().get(&AGENT_KEY).unwrap();
        agent.require_auth();

        let policy: Policy = env.storage().instance().get(&POLICY_KEY).unwrap();
        let ts = env.ledger().timestamp();

        // --- Rolling window reset -------------------------------------------
        let last_reset: u64 = env.storage().instance().get(&RESET_KEY).unwrap_or(0);
        let mut spent_today: i128 = env.storage().instance().get(&SPENT_KEY).unwrap_or(0);

        if ts.saturating_sub(last_reset) >= WINDOW {
            spent_today = 0;
            env.storage().instance().set(&RESET_KEY, &ts);
        }

        // --- Policy checks (emit breach event before returning error) --------

        if amount > policy.max_per_tx {
            env.events().publish(
                (symbol_short!("breach"), symbol_short!("max_tx")),
                (ts, amount, recipient.clone(), symbol_short!("max_tx")),
            );
            return Err(Error::ExceedsMaxPerTx);
        }

        if spent_today + amount > policy.daily_cap {
            env.events().publish(
                (symbol_short!("breach"), symbol_short!("daily")),
                (ts, amount, recipient.clone(), symbol_short!("daily_cap")),
            );
            return Err(Error::ExceedsDailyCap);
        }

        if !policy.allowed_destinations.contains(&recipient) {
            env.events().publish(
                (symbol_short!("breach"), symbol_short!("dest")),
                (ts, amount, recipient.clone(), symbol_short!("allowed")),
            );
            return Err(Error::RecipientNotAllowed);
        }

        // --- Balance check --------------------------------------------------
        let token_address: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let token_client = token::Client::new(env, &token_address);
        let balance = token_client.balance(&env.current_contract_address());
        if balance < amount {
            return Err(Error::InsufficientBalance);
        }

        // --- Derive unique spend nullifier -----------------------------------
        // nullifier = sha256(nonce_bytes)  where nonce is per-wallet monotonic.
        let nonce: u64 = env.storage().instance().get(&NONCE_KEY).unwrap_or(0);
        let nonce_bytes = Bytes::from_slice(env, &nonce.to_be_bytes());
        let nullifier: BytesN<32> = env.crypto().sha256(&nonce_bytes).into();

        // --- State updates (before transfer — checks-effects-interactions) ---
        spent_today += amount;
        env.storage().instance().set(&SPENT_KEY, &spent_today);
        env.storage().instance().set(&NONCE_KEY, &(nonce + 1));

        // --- Transfer -------------------------------------------------------
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // --- Emit spend receipt ---------------------------------------------
        env.events().publish(
            (symbol_short!("spend"),),
            (nullifier.clone(), amount, recipient, memo),
        );

        Ok(nullifier)
    }

    // -----------------------------------------------------------------------
    // Policy management (owner only)
    // -----------------------------------------------------------------------

    /// Update spending rules. Only callable by `policy.owner`.
    /// `owner` itself is immutable — it cannot be changed via this function.
    ///
    /// # Arguments
    /// * `new_max_per_tx`           - New per-transaction cap (stroops).
    /// * `new_daily_cap`            - New rolling-24h cap (stroops).
    /// * `new_allowed_destinations` - New exact-match whitelist of addresses.
    pub fn update_policy(
        env: &Env,
        new_max_per_tx: i128,
        new_daily_cap: i128,
        new_allowed_destinations: Vec<Address>,
    ) -> Result<(), Error> {
        let policy: Policy = env.storage().instance().get(&POLICY_KEY).unwrap();
        policy.owner.require_auth();

        if new_daily_cap < new_max_per_tx {
            return Err(Error::InvalidPolicy);
        }

        let updated = Policy {
            max_per_tx: new_max_per_tx,
            daily_cap: new_daily_cap,
            allowed_destinations: new_allowed_destinations,
            owner: policy.owner, // owner is never changed by this function
        };
        env.storage().instance().set(&POLICY_KEY, &updated);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    pub fn get_policy(env: &Env) -> Policy {
        env.storage().instance().get(&POLICY_KEY).unwrap()
    }

    /// Returns cumulative spend in the current rolling window (stroops).
    pub fn get_daily_spent(env: &Env) -> i128 {
        let ts = env.ledger().timestamp();
        let last_reset: u64 = env.storage().instance().get(&RESET_KEY).unwrap_or(0);
        let spent: i128 = env.storage().instance().get(&SPENT_KEY).unwrap_or(0);

        if ts.saturating_sub(last_reset) >= WINDOW {
            0 // window has elapsed, current spend is zero
        } else {
            spent
        }
    }

    pub fn get_balance(env: &Env) -> i128 {
        let token_address: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let token_client = token::Client::new(env, &token_address);
        token_client.balance(&env.current_contract_address())
    }

    pub fn get_agent(env: &Env) -> Address {
        env.storage().instance().get(&AGENT_KEY).unwrap()
    }
}
