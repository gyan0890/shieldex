// ============================================================
// stellar.ts — Stellar / Soroban SDK integration
//
// Wired to the Agent Policy Wallet contract:
//   pay(amount: i128, recipient: Address, memo: String) -> Result<BytesN<32>, Error>
//   get_policy()       -> Policy
//   get_daily_spent()  -> i128
//   get_balance()      -> i128
//
// All USDC amounts in this file use 7 decimal places (stroops convention):
//   1 USDC = 10_000_000 base units
// ============================================================

import {
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { PolicyConfig, ContractState } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stellar USDC uses 7 decimal places: 1 USDC = 10_000_000 base units */
const STROOP = 10_000_000n;

// ─── Config (from .env) ───────────────────────────────────────────────────────

const SOROBAN_RPC_URL =
  process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY ?? "";
const AGENT_WALLET_CONTRACT_ID = process.env.CONTRACT_ADDRESS ?? "";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
}

function getAgentKeypair(): Keypair {
  if (!AGENT_SECRET_KEY) {
    throw new Error("AGENT_SECRET_KEY is not set in .env");
  }
  return Keypair.fromSecret(AGENT_SECRET_KEY);
}

function getContract(): Contract {
  if (!AGENT_WALLET_CONTRACT_ID) {
    throw new Error("CONTRACT_ADDRESS is not set in .env");
  }
  return new Contract(AGENT_WALLET_CONTRACT_ID);
}

/** Converts a USDC float (e.g. 5.00) to i128 stroops as BigInt */
function toStroops(usdcAmount: number): bigint {
  return BigInt(Math.round(usdcAmount * Number(STROOP)));
}

/** Converts i128 stroops (BigInt) back to a USDC float */
function fromStroops(stroops: bigint): number {
  return Number(stroops) / Number(STROOP);
}

/**
 * Builds and simulates a read-only contract call.
 * Returns the raw ScVal result — caller must parse it.
 */
async function simulateReadCall(
  fnName: string,
  ...args: Parameters<typeof Contract.prototype.call>[1][]
) {
  const server = getServer();
  const keypair = getAgentKeypair();
  const contract = getContract();
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(fnName, ...args))
    .setTimeout(30)
    .build();

  const simResponse = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    throw new Error(`[${fnName}] Simulation error: ${simResponse.error}`);
  }
  if (!simResponse.result?.retval) {
    throw new Error(`[${fnName}] Returned no value`);
  }

  return simResponse.result.retval;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calls pay(amount: i128, recipient: Address, memo: String) on the contract.
 *
 * The contract enforces all three policy rules before releasing funds:
 *   1. amount <= max_per_tx
 *   2. rolling_24h_spend + amount <= daily_cap
 *   3. recipient IN allowed_destinations
 *
 * On success, returns the transaction hash and the 32-byte nullifier hash
 * (SHA-256 of the internal monotonic nonce) emitted by the contract.
 *
 * Throws with a descriptive message if the contract rejects (policy breach,
 * insufficient balance, or network error).
 */
export async function callPayContract(
  amount: number,
  recipient: string,
  memo: string
): Promise<{ tx_hash: string; nullifier_hash: string }> {
  const server = getServer();
  const keypair = getAgentKeypair();
  const contract = getContract();
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        "pay",
        nativeToScVal(toStroops(amount), { type: "i128" }),  // amount: i128
        new Address(recipient).toScVal(),                     // recipient: Address
        nativeToScVal(memo, { type: "string" })               // memo: String
      )
    )
    .setTimeout(30)
    .build();

  // Simulate — this is where on-chain policy enforcement runs.
  // If the contract would reject, simulateTransaction returns an error here.
  const simResponse = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    // Surface the contract error as a readable message
    const contractErr = parseContractError(simResponse.error);
    throw new Error(contractErr);
  }

  // Assemble (attaches auth + fees from simulation) → sign → submit
  const preparedTx = SorobanRpc.assembleTransaction(tx, simResponse).build();
  preparedTx.sign(keypair);

  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error(
      `Transaction rejected: ${JSON.stringify(sendResponse.errorResult)}`
    );
  }

  // Poll for on-chain confirmation (up to ~15 seconds)
  const txHash = sendResponse.hash;
  const MAX_RETRIES = 10;
  let retries = 0;
  let getResponse = await server.getTransaction(txHash);

  while (
    getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    retries < MAX_RETRIES
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await server.getTransaction(txHash);
    retries++;
  }

  if (getResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Transaction failed on-chain. Hash: ${txHash}`);
  }

  if (getResponse.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction confirmation timed out. Hash: ${txHash}`);
  }

  // pay() returns Result<BytesN<32>, Error>.
  // On success, the return value is the 32-byte nullifier (ScvBytes).
  // scValToNative converts ScvBytes → Buffer.
  const returnVal = getResponse.returnValue;
  let nullifierHash: string;

  if (returnVal) {
    const nullifierBytes = scValToNative(returnVal) as Buffer;
    nullifierHash = "0x" + Buffer.from(nullifierBytes).toString("hex");
  } else {
    // Fallback: use tx hash prefixed (shouldn't happen with a correct contract)
    nullifierHash = "0x" + txHash;
  }

  return { tx_hash: txHash, nullifier_hash: nullifierHash };
}

/**
 * Reads the current Policy struct from the contract via get_policy().
 *
 * Contract struct:
 *   Policy { max_per_tx: i128, daily_cap: i128, allowed_destinations: Vec<Address>, owner: Address }
 *
 * Converts i128 stroops → USDC floats for the middleware layer.
 */
export async function getContractPolicy(): Promise<PolicyConfig> {
  const retval = await simulateReadCall("get_policy");

  const raw = scValToNative(retval) as {
    max_per_tx: bigint;
    daily_cap: bigint;
    allowed_destinations: string[];
    owner: string;
  };

  return {
    max_per_tx: fromStroops(raw.max_per_tx),
    daily_cap: fromStroops(raw.daily_cap),
    allowed_destinations: raw.allowed_destinations ?? ["*"],
    currency: "USDC",
  };
}

/**
 * Reads the rolling 24-hour spend directly from contract storage via get_daily_spent().
 * Returns a USDC float.
 */
export async function getContractDailySpent(): Promise<number> {
  const retval = await simulateReadCall("get_daily_spent");
  const stroops = scValToNative(retval) as bigint;
  return fromStroops(stroops);
}

/**
 * Reads the contract's current USDC token balance via get_balance().
 * Returns a USDC float.
 */
export async function getContractBalance(): Promise<number> {
  const retval = await simulateReadCall("get_balance");
  const stroops = scValToNative(retval) as bigint;
  return fromStroops(stroops);
}

/**
 * Reads both daily_spent and balance from the contract in parallel.
 * Used by the /status endpoint.
 */
export async function getContractState(): Promise<ContractState> {
  const [daily_spent_usdc, balance_usdc] = await Promise.all([
    getContractDailySpent(),
    getContractBalance(),
  ]);
  return { balance_usdc, daily_spent_usdc };
}

/** Quick connectivity check — called on server startup */
export async function checkStellarConnection(): Promise<boolean> {
  try {
    const server = getServer();
    const health = await server.getHealth();
    console.log(
      `[Stellar] Connected to ${SOROBAN_RPC_URL} — status: ${health.status}`
    );
    return true;
  } catch (err) {
    console.warn(`[Stellar] Could not connect to Soroban RPC: ${err}`);
    return false;
  }
}

// ─── Internal error parsing ───────────────────────────────────────────────────

/**
 * Maps the raw Soroban simulation error string to a human-readable message.
 * The contract error enum: ExceedsMaxPerTx | ExceedsDailyCap | RecipientNotAllowed
 *   | Unauthorized | InsufficientBalance | InvalidPolicy
 */
function parseContractError(rawError: string): string {
  if (rawError.includes("ExceedsMaxPerTx"))
    return "Contract rejected: payment exceeds max_per_tx limit";
  if (rawError.includes("ExceedsDailyCap"))
    return "Contract rejected: payment would exceed daily_cap";
  if (rawError.includes("RecipientNotAllowed"))
    return "Contract rejected: recipient is not in allowed_destinations";
  if (rawError.includes("InsufficientBalance"))
    return "Contract rejected: insufficient balance in agent wallet";
  if (rawError.includes("Unauthorized"))
    return "Contract rejected: caller is not the authorized agent";
  return `Contract error: ${rawError}`;
}
