#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, vec, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn create_token<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    token::StellarAssetClient::new(env, &sac.address())
}

struct TestSetup {
    env: Env,
    agent: Address,
    owner: Address,
    token_admin: Address,
    wallet_addr: Address,
    token_addr: Address,
    dest1: Address,
    dest2: Address,
}

impl TestSetup {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let agent = Address::generate(&env);
        let owner = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let dest1 = Address::generate(&env);
        let dest2 = Address::generate(&env);

        let sac = create_token(&env, &token_admin);
        let token_addr = sac.address.clone();

        // Mint 100 XLM worth of token to fund the wallet
        sac.mint(&owner, &10_000_000_000_i128);

        let policy = Policy {
            max_per_tx: 5_000_000,       // 0.5 XLM
            daily_cap: 50_000_000,       // 5 XLM
            allowed_destinations: vec![&env, dest1.clone(), dest2.clone()],
            owner: owner.clone(),
        };

        let wallet_addr = env.register(
            AgentWalletContract,
            (agent.clone(), token_addr.clone(), policy),
        );

        // Fund the wallet directly (simulates privacy pool funding)
        let token = token::Client::new(&env, &token_addr);
        token.transfer(&owner, &wallet_addr, &1_000_000_000_i128); // 100 XLM

        TestSetup {
            env,
            agent,
            owner,
            token_admin,
            wallet_addr,
            token_addr,
            dest1,
            dest2,
        }
    }

    fn wallet(&self) -> AgentWalletContractClient {
        AgentWalletContractClient::new(&self.env, &self.wallet_addr)
    }

    fn token(&self) -> token::Client {
        token::Client::new(&self.env, &self.token_addr)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn test_pay_success() {
    let t = TestSetup::new();
    let wallet = t.wallet();

    let nullifier = wallet.pay(&5_000_000_i128, &t.dest1, &String::from_str(&t.env, "test pay"));
    assert_eq!(nullifier.len(), 32);

    // Balance decreased
    assert_eq!(wallet.get_balance(), 1_000_000_000 - 5_000_000);
    // Daily spend tracked
    assert_eq!(wallet.get_daily_spent(), 5_000_000);
}

#[test]
fn test_pay_returns_unique_nullifiers() {
    let t = TestSetup::new();
    let wallet = t.wallet();

    let n1 = wallet.pay(&1_000_000_i128, &t.dest1, &String::from_str(&t.env, "first"));
    let n2 = wallet.pay(&1_000_000_i128, &t.dest1, &String::from_str(&t.env, "second"));
    assert_ne!(n1, n2);
}

#[test]
fn test_pay_exceeds_max_per_tx() {
    let t = TestSetup::new();
    // 6 XLM > max_per_tx of 0.5 XLM
    let result = t.wallet().try_pay(
        &6_000_000_i128,
        &t.dest1,
        &String::from_str(&t.env, "too big"),
    );
    assert_eq!(result, Err(Ok(Error::ExceedsMaxPerTx)));
}

#[test]
fn test_pay_unlisted_recipient() {
    let t = TestSetup::new();
    let stranger = Address::generate(&t.env);
    let result = t.wallet().try_pay(
        &1_000_000_i128,
        &stranger,
        &String::from_str(&t.env, "drain attempt"),
    );
    assert_eq!(result, Err(Ok(Error::RecipientNotAllowed)));
}

#[test]
fn test_pay_exceeds_daily_cap() {
    let t = TestSetup::new();
    let wallet = t.wallet();

    // 10 payments of 5 XLM = 50 XLM = daily cap
    for _ in 0..10 {
        wallet.pay(&5_000_000_i128, &t.dest1, &String::from_str(&t.env, "ok"));
    }
    // 11th should fail (total would be 55 XLM > 50 XLM cap)
    let result = wallet.try_pay(
        &5_000_000_i128,
        &t.dest1,
        &String::from_str(&t.env, "over cap"),
    );
    assert_eq!(result, Err(Ok(Error::ExceedsDailyCap)));
}

#[test]
fn test_daily_cap_resets_after_window() {
    let t = TestSetup::new();
    let wallet = t.wallet();

    // Exhaust the daily cap
    for _ in 0..10 {
        wallet.pay(&5_000_000_i128, &t.dest1, &String::from_str(&t.env, "ok"));
    }
    assert_eq!(wallet.get_daily_spent(), 50_000_000);

    // Advance ledger time by 25 hours
    t.env.ledger().with_mut(|li| {
        li.timestamp += 90_000; // 25 hours
    });

    // Window reset — daily spent should read as 0 now
    assert_eq!(wallet.get_daily_spent(), 0);

    // And a new payment should succeed
    wallet.pay(
        &5_000_000_i128,
        &t.dest1,
        &String::from_str(&t.env, "fresh window"),
    );
    assert_eq!(wallet.get_daily_spent(), 5_000_000);
}

#[test]
fn test_update_policy_owner_only() {
    let t = TestSetup::new();
    let wallet = t.wallet();

    let new_dest = Address::generate(&t.env);
    wallet.update_policy(
        &2_000_000_i128,
        &20_000_000_i128,
        &vec![&t.env, new_dest.clone()],
    );

    let policy = wallet.get_policy();
    assert_eq!(policy.max_per_tx, 2_000_000);
    assert_eq!(policy.daily_cap, 20_000_000);
    assert_eq!(policy.allowed_destinations.len(), 1);
    // Owner unchanged
    assert_eq!(policy.owner, t.owner);
}

#[test]
fn test_update_policy_rejects_invalid_caps() {
    let t = TestSetup::new();
    // daily_cap < max_per_tx should fail
    let result = t.wallet().try_update_policy(
        &10_000_000_i128,
        &5_000_000_i128,
        &vec![&t.env, t.dest1.clone()],
    );
    assert_eq!(result, Err(Ok(Error::InvalidPolicy)));
}

#[test]
fn test_get_balance() {
    let t = TestSetup::new();
    assert_eq!(t.wallet().get_balance(), 1_000_000_000);
}

#[test]
fn test_empty_destinations_blocks_all_payments() {
    let env = Env::default();
    env.mock_all_auths();

    let agent = Address::generate(&env);
    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let sac = create_token(&env, &token_admin);
    let token_addr = sac.address.clone();
    sac.mint(&owner, &10_000_000_000_i128);

    let policy = Policy {
        max_per_tx: 5_000_000,
        daily_cap: 50_000_000,
        allowed_destinations: vec![&env], // empty — all payments blocked
        owner: owner.clone(),
    };

    let wallet_addr = env.register(AgentWalletContract, (agent, token_addr.clone(), policy));
    let token = token::Client::new(&env, &token_addr);
    token.transfer(&owner, &wallet_addr, &1_000_000_000_i128);

    let wallet = AgentWalletContractClient::new(&env, &wallet_addr);
    let dest = Address::generate(&env);

    // Empty whitelist — all payments blocked
    let result = wallet.try_pay(&1_000_000_i128, &dest, &String::from_str(&env, "blocked"));
    assert_eq!(result, Err(Ok(Error::RecipientNotAllowed)));
}
