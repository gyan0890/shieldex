#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contractimpl, log, symbol_short, token, vec, Address, Bytes, BytesN, Env, String,
    Symbol, Vec,
};

use lean_imt::{LeanIMT, TREE_DEPTH_KEY, TREE_LEAVES_KEY, TREE_ROOT_KEY};
use zk::{Groth16Verifier, Proof, PublicSignals, VerificationKey};

#[cfg(test)]
mod test;

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NullifierUsed = 1,
    InsufficientBalance = 2,
    CoinOwnershipProofFailed = 3,
    OnlyAdmin = 4,
    TreeAtCapacity = 5,
    AssociationRootMismatch = 6,
}

pub const ERROR_NULLIFIER_USED: &str = "Nullifier already used";
pub const ERROR_INSUFFICIENT_BALANCE: &str = "Insufficient balance";
pub const ERROR_COIN_OWNERSHIP_PROOF: &str = "Couldn't verify coin ownership proof";
pub const ERROR_WITHDRAW_SUCCESS: &str = "Withdrawal successful";
pub const ERROR_ONLY_ADMIN: &str = "Only the admin can set association root";
pub const SUCCESS_ASSOCIATION_ROOT_SET: &str = "Association root set successfully";

const TREE_DEPTH: u32 = 20;

const NULL_KEY: Symbol = symbol_short!("null");
const VK_KEY: Symbol = symbol_short!("vk");
const TOKEN_KEY: Symbol = symbol_short!("token");
const ASSOCIATION_ROOT_KEY: Symbol = symbol_short!("assoc");
const ADMIN_KEY: Symbol = symbol_short!("admin");

/// Fixed deposit/withdrawal denomination: 1 XLM in stroops.
/// Multiple deposits fund the agent wallet incrementally.
const FIXED_AMOUNT: i128 = 1_000_000_000;

#[contract]
pub struct PrivacyPoolsContract;

#[contractimpl]
impl PrivacyPoolsContract {
    pub fn __constructor(env: &Env, vk_bytes: Bytes, token_address: Address, admin: Address) {
        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&VK_KEY, &vk_bytes);
        env.storage().instance().set(&TOKEN_KEY, &token_address);

        let tree = LeanIMT::new(env, TREE_DEPTH);
        let (leaves, depth, root) = tree.to_storage();
        env.storage().instance().set(&TREE_LEAVES_KEY, &leaves);
        env.storage().instance().set(&TREE_DEPTH_KEY, &depth);
        env.storage().instance().set(&TREE_ROOT_KEY, &root);
    }

    fn store_commitment(env: &Env, commitment: BytesN<32>) -> Result<(BytesN<32>, u32), Error> {
        let leaves: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&TREE_LEAVES_KEY)
            .unwrap_or(vec![&env]);
        let depth: u32 = env.storage().instance().get(&TREE_DEPTH_KEY).unwrap_or(0);
        let root: BytesN<32> = env
            .storage()
            .instance()
            .get(&TREE_ROOT_KEY)
            .unwrap_or(BytesN::from_array(&env, &[0u8; 32]));

        let mut tree = LeanIMT::from_storage(env, leaves, depth, root);
        tree.insert(commitment).map_err(|_| Error::TreeAtCapacity)?;
        let leaf_index = tree.get_leaf_count() - 1;

        let (new_leaves, new_depth, new_root) = tree.to_storage();
        env.storage().instance().set(&TREE_LEAVES_KEY, &new_leaves);
        env.storage().instance().set(&TREE_DEPTH_KEY, &new_depth);
        env.storage().instance().set(&TREE_ROOT_KEY, &new_root);

        Ok((new_root, leaf_index))
    }

    pub fn deposit(env: &Env, from: Address, commitment: BytesN<32>) -> Result<u32, Error> {
        from.require_auth();

        let token_address: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let token_client = token::Client::new(env, &token_address);
        token_client.transfer(&from, &env.current_contract_address(), &FIXED_AMOUNT);

        let (_, leaf_index) = Self::store_commitment(env, commitment)?;
        Ok(leaf_index)
    }

    pub fn withdraw(
        env: &Env,
        to: Address,
        proof_bytes: Bytes,
        pub_signals_bytes: Bytes,
    ) -> Vec<String> {
        to.require_auth();
        Self::process_verified_withdrawal(env, &to, proof_bytes, pub_signals_bytes)
    }

    /// Routes a verified ZK withdrawal directly into an agent wallet contract.
    ///
    /// Identical proof requirements to `withdraw()` — the depositor's anonymity is
    /// fully preserved. The difference is the destination: funds are transferred to
    /// `agent_contract` (a contract address) rather than a personal wallet. No
    /// `require_auth()` on the destination because the agent contract is a recipient,
    /// not a signer.
    ///
    /// # Arguments
    /// * `agent_contract` - Address of the deployed AgentPolicyWallet contract to fund
    /// * `proof_bytes`    - Serialized Groth16 proof
    /// * `pub_signals_bytes` - Serialized public signals: [nullifierHash, withdrawnValue, stateRoot, associationRoot]
    pub fn fund_agent_wallet(
        env: &Env,
        agent_contract: Address,
        proof_bytes: Bytes,
        pub_signals_bytes: Bytes,
    ) -> Vec<String> {
        // No require_auth on agent_contract — it is a destination, not a signer.
        // The ZK proof is the sole authorization mechanism.
        Self::process_verified_withdrawal(env, &agent_contract, proof_bytes, pub_signals_bytes)
    }

    /// Shared withdrawal logic: verifies ZK proof, consumes nullifier, transfers funds.
    /// Used by both `withdraw()` and `fund_agent_wallet()`.
    fn process_verified_withdrawal(
        env: &Env,
        recipient: &Address,
        proof_bytes: Bytes,
        pub_signals_bytes: Bytes,
    ) -> Vec<String> {
        if !Self::has_association_set(env) {
            panic!("Association root must be set before withdrawal");
        }

        let token_address: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let token_client = token::Client::new(env, &token_address);

        let contract_balance = token_client.balance(&env.current_contract_address());
        if contract_balance < FIXED_AMOUNT {
            return vec![env, String::from_str(env, ERROR_INSUFFICIENT_BALANCE)];
        }

        let vk_bytes: Bytes = env.storage().instance().get(&VK_KEY).unwrap();
        let vk = VerificationKey::from_bytes(env, &vk_bytes).unwrap();
        let proof = Proof::from_bytes(env, &proof_bytes);
        let pub_signals = PublicSignals::from_bytes(env, &pub_signals_bytes);

        let nullifier_hash = &pub_signals.pub_signals.get(0).unwrap();
        let _withdrawn_value = &pub_signals.pub_signals.get(1).unwrap();
        let proof_root = &pub_signals.pub_signals.get(2).unwrap();
        let proof_association_root = &pub_signals.pub_signals.get(3).unwrap();

        let stored_association_root = Self::get_association_root(env);
        if stored_association_root != proof_association_root.to_bytes() {
            return vec![env, String::from_str(env, "Association set root mismatch")];
        }

        let mut nullifiers: Vec<BytesN<32>> =
            env.storage().instance().get(&NULL_KEY).unwrap_or(vec![env]);
        let nullifier = nullifier_hash.to_bytes();

        if nullifiers.contains(&nullifier) {
            return vec![env, String::from_str(env, ERROR_NULLIFIER_USED)];
        }

        let state_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&TREE_ROOT_KEY)
            .unwrap_or(BytesN::from_array(&env, &[0u8; 32]));

        if state_root != proof_root.to_bytes() {
            return vec![env, String::from_str(env, ERROR_COIN_OWNERSHIP_PROOF)];
        }

        let res = Groth16Verifier::verify_proof(env, vk, proof, &pub_signals.pub_signals);
        if res.is_err() || !res.unwrap() {
            return vec![env, String::from_str(env, ERROR_COIN_OWNERSHIP_PROOF)];
        }

        // Consume nullifier before transfer (checks-effects-interactions)
        nullifiers.push_back(nullifier);
        env.storage().instance().set(&NULL_KEY, &nullifiers);

        token_client.transfer(&env.current_contract_address(), recipient, &FIXED_AMOUNT);

        log!(&env, "{}", ERROR_WITHDRAW_SUCCESS);
        vec![env]
    }

    pub fn get_merkle_root(env: &Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&TREE_ROOT_KEY)
            .unwrap_or(BytesN::from_array(&env, &[0u8; 32]))
    }

    pub fn get_merkle_depth(env: &Env) -> u32 {
        env.storage().instance().get(&TREE_DEPTH_KEY).unwrap_or(0)
    }

    pub fn get_commitment_count(env: &Env) -> u32 {
        let leaves: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&TREE_LEAVES_KEY)
            .unwrap_or(vec![&env]);
        leaves.len() as u32
    }

    pub fn get_commitments(env: &Env) -> Vec<BytesN<32>> {
        env.storage()
            .instance()
            .get(&TREE_LEAVES_KEY)
            .unwrap_or(vec![env])
    }

    pub fn get_nullifiers(env: &Env) -> Vec<BytesN<32>> {
        env.storage().instance().get(&NULL_KEY).unwrap_or(vec![env])
    }

    pub fn get_balance(env: &Env) -> i128 {
        let token_address: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let token_client = token::Client::new(env, &token_address);
        token_client.balance(&env.current_contract_address())
    }

    fn is_admin(env: &Env, caller: &Address) -> bool {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY).unwrap();
        *caller == admin
    }

    pub fn set_association_root(
        env: &Env,
        caller: Address,
        association_root: BytesN<32>,
    ) -> Vec<String> {
        caller.require_auth();
        if !Self::is_admin(env, &caller) {
            return vec![env, String::from_str(env, ERROR_ONLY_ADMIN)];
        }
        env.storage()
            .instance()
            .set(&ASSOCIATION_ROOT_KEY, &association_root);
        vec![env, String::from_str(env, SUCCESS_ASSOCIATION_ROOT_SET)]
    }

    pub fn get_association_root(env: &Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&ASSOCIATION_ROOT_KEY)
            .unwrap_or(BytesN::from_array(&env, &[0u8; 32]))
    }

    pub fn has_association_set(env: &Env) -> bool {
        let association_root = Self::get_association_root(env);
        let zero_root = BytesN::from_array(&env, &[0u8; 32]);
        association_root != zero_root
    }

    pub fn get_admin(env: &Env) -> Address {
        env.storage().instance().get(&ADMIN_KEY).unwrap()
    }
}
