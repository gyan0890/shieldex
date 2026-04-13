/**
 * lib/soroban.ts
 *
 * Shared Soroban utility — can be imported directly in any Next.js API route
 * (server-side) without making an HTTP round-trip to another route.
 *
 * This avoids the "relative URL" problem when NEXT_PUBLIC_MIDDLEWARE_URL=/api/shieldex
 * is used on Vercel (server-to-server fetches require absolute URLs).
 */

import {
  Address,
  Contract,
  Keypair,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";

// ── Constants ──────────────────────────────────────────────────────────────────

const STROOP = 10_000_000n; // 1 USDC = 10_000_000 base units
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

function getConfig() {
  const agentSecretKey = process.env.AGENT_SECRET_KEY ?? "";
  const contractId =
    process.env.CONTRACT_ADDRESS ??
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
    "CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6";
  return { agentSecretKey, contractId };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toStroops(usdc: number): bigint {
  return BigInt(Math.round(usdc * Number(STROOP)));
}

function fromStroops(s: bigint): number {
  return Number(s) / Number(STROOP);
}

/** Raw JSON-RPC poll — avoids SDK XDR decode issues with Protocol 22 */
async function fetchTxStatus(txHash: string): Promise<string | null> {
  try {
    const resp = await fetch(SOROBAN_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const json = (await resp.json()) as { result?: { status: string } };
    return json.result?.status ?? null;
  } catch {
    return null;
  }
}

/** Reads a contract view function via simulation (no gas) */
async function simulateRead(
  server: SorobanRpc.Server,
  keypair: Keypair,
  contract: Contract,
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) {
  const account = await server.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(fnName, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation error: ${sim.error}`);
  }
  if (!("result" in sim) || !sim.result) {
    throw new Error("No result from simulation");
  }
  return sim.result.retval;
}

function parseContractError(err: string): string {
  if (err.includes("ExceedsMaxPerTx") || err.includes("max_per_tx"))
    return "MAX_TX_EXCEEDED";
  if (err.includes("ExceedsDailyCap") || err.includes("daily_cap"))
    return "DAILY_CAP_EXCEEDED";
  if (
    err.includes("RecipientNotAllowed") ||
    err.includes("allowed_destinations")
  )
    return "DISALLOWED_RECIPIENT";
  if (err.includes("InsufficientBalance")) return "INSUFFICIENT_BALANCE";
  return "CONTRACT_ERROR";
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface PayResult {
  status: "approved" | "rejected";
  tx_hash?: string;
  nullifier_hash?: string;
  rejection_code?: string;
  reason?: string;
  daily_spent?: number;
  daily_remaining?: number;
}

export interface PolicyResult {
  max_per_tx: number;
  daily_cap: number;
  allowed_destinations: string[];
  currency: string;
}

export interface StatusResult {
  ok: boolean;
  policy_source: string;
  policy: PolicyResult;
  today: {
    date: string;
    spent: number;
    remaining: number;
    cap: number;
  };
}

export interface BalanceResult {
  ok: boolean;
  contract_balance_usdc: number;
}

/**
 * Execute a USDC payment via the Soroban agent-wallet contract.
 * Policy enforcement (max_per_tx, daily_cap, allowed_destinations) happens
 * inside the contract — simulating the tx will fail if limits are exceeded.
 */
export async function callSorobanPay(
  amount: number,
  recipient: string,
  reason: string
): Promise<PayResult> {
  const { agentSecretKey, contractId } = getConfig();

  if (!agentSecretKey) {
    return {
      status: "rejected",
      rejection_code: "MISCONFIGURED",
      reason: "AGENT_SECRET_KEY not configured",
    };
  }

  try {
    const server = new SorobanRpc.Server(SOROBAN_RPC_URL, {
      allowHttp: false,
    });
    const keypair = Keypair.fromSecret(agentSecretKey);
    const contract = new Contract(contractId);
    const account = await server.getAccount(keypair.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "pay",
          nativeToScVal(toStroops(amount), { type: "i128" }),
          new Address(recipient).toScVal(),
          nativeToScVal(String(reason), { type: "string" })
        )
      )
      .setTimeout(30)
      .build();

    // Simulate — contract enforces policy here
    const sim = await server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(sim)) {
      const code = parseContractError(sim.error);
      const statusData = await getSorobanStatus();
      return {
        status: "rejected",
        rejection_code: code,
        reason: sim.error,
        daily_spent: statusData.today.spent,
        daily_remaining: statusData.today.remaining,
      };
    }

    // Assemble → sign → submit
    const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();
    preparedTx.sign(keypair);
    const sendResp = await server.sendTransaction(preparedTx);

    if (sendResp.status === "ERROR") {
      throw new Error(`Submit failed: ${JSON.stringify(sendResp.errorResult)}`);
    }

    // Poll for confirmation
    const txHash = sendResp.hash;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await fetchTxStatus(txHash);
      if (!status || status === "NOT_FOUND") continue;
      if (status === "FAILED") throw new Error(`Tx failed on-chain: ${txHash}`);
      if (status === "SUCCESS") break;
    }

    const statusData = await getSorobanStatus();
    return {
      status: "approved",
      tx_hash: txHash,
      nullifier_hash: "0x" + txHash,
      daily_spent: statusData.today.spent,
      daily_remaining: statusData.today.remaining,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = parseContractError(msg);

    let daily_spent = 0;
    let daily_remaining = 2;
    try {
      const statusData = await getSorobanStatus();
      daily_spent = statusData.today.spent;
      daily_remaining = statusData.today.remaining;
    } catch {
      /* ignore */
    }

    return {
      status: "rejected",
      rejection_code: code,
      reason: msg,
      daily_spent,
      daily_remaining,
    };
  }
}

/**
 * Read policy + daily spend from contract (no gas).
 */
export async function getSorobanStatus(): Promise<StatusResult> {
  const { agentSecretKey, contractId } = getConfig();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  const keypair = Keypair.fromSecret(agentSecretKey);
  const contract = new Contract(contractId);

  const [policyVal, spentVal] = await Promise.all([
    simulateRead(server, keypair, contract, "get_policy"),
    simulateRead(server, keypair, contract, "get_daily_spent"),
  ]);

  const raw = scValToNative(policyVal) as {
    max_per_tx: bigint;
    daily_cap: bigint;
    allowed_destinations: string[];
  };

  const spent = fromStroops(scValToNative(spentVal) as bigint);
  const cap = fromStroops(raw.daily_cap);

  return {
    ok: true,
    policy_source: "contract",
    policy: {
      max_per_tx: fromStroops(raw.max_per_tx),
      daily_cap: cap,
      allowed_destinations: raw.allowed_destinations ?? [],
      currency: "USDC",
    },
    today: {
      date: new Date().toISOString().slice(0, 10),
      spent,
      remaining: Math.max(0, cap - spent),
      cap,
    },
  };
}

/**
 * Read the agent wallet contract balance (no gas).
 */
export async function getSorobanBalance(): Promise<BalanceResult> {
  const { agentSecretKey, contractId } = getConfig();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  const keypair = Keypair.fromSecret(agentSecretKey);
  const contract = new Contract(contractId);

  const retval = await simulateRead(
    server,
    keypair,
    contract,
    "get_balance"
  );
  const balance = fromStroops(scValToNative(retval) as bigint);

  return { ok: true, contract_balance_usdc: balance };
}
