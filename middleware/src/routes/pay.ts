// ============================================================
// routes/pay.ts — POST /pay
//
// Payment flow:
//   1. Validate request shape
//   2. Load active policy (contract → config.json fallback)
//   3. Pre-validate locally (fast, no gas)
//   4. Call Soroban contract (on-chain enforcement + token transfer)
//   5. Record spend in daily tracker
//   6. Log result + return response
// ============================================================

import { Router, Request, Response } from "express";
import path from "path";
import { PayRequest, PayResponse, PolicyConfig } from "../types";
import { validatePayment, loadPolicyFromConfig } from "../policy";
import { spendTracker } from "../spendTracker";
import { logPaymentAttempt } from "../logger";
import { callPayContract, getContractPolicy } from "../stellar";

const router = Router();
const CONFIG_PATH = path.resolve(__dirname, "../../../config.json");

// ── Policy bootstrap ──────────────────────────────────────────────────────────
// Try to load policy from the on-chain contract at startup.
// Falls back to config.json if the contract isn't reachable yet.

let activePolicy: PolicyConfig = loadPolicyFromConfig(CONFIG_PATH);
let policySource: "contract" | "config" = "config";

(async () => {
  try {
    activePolicy = await getContractPolicy();
    policySource = "contract";
    console.log(
      `[Policy] ✅ Loaded from contract — ` +
      `max_per_tx=${activePolicy.max_per_tx} USDC, ` +
      `daily_cap=${activePolicy.daily_cap} USDC, ` +
      `destinations=${activePolicy.allowed_destinations.length} allowed`
    );
  } catch (err) {
    policySource = "config";
    console.warn(
      `[Policy] ⚠️  Contract not reachable, using config.json fallback: ${err}`
    );
    console.log(
      `[Policy] max_per_tx=${activePolicy.max_per_tx} USDC, ` +
      `daily_cap=${activePolicy.daily_cap} USDC`
    );
  }
})();

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /pay
 *
 * Body: { amount: number, recipient: string, reason: string }
 *
 * Returns PayResponse with status "approved" or "rejected".
 * All responses are HTTP 200 — use `status` field to determine outcome.
 * HTTP 400 is returned only for malformed requests (missing fields).
 */
router.post("/", async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  // ── Step 1: Request shape validation ─────────────────────
  const { amount, recipient, reason } = req.body as Partial<PayRequest>;

  if (amount === undefined || !recipient || !reason) {
    return res.status(400).json({
      status: "rejected",
      rejection_code: "INVALID_AMOUNT",
      reason: "Request must include: amount (number), recipient (string), reason (string)",
      timestamp,
    } as PayResponse);
  }

  const request: PayRequest = {
    amount: Number(amount),
    recipient: String(recipient),
    reason: String(reason),
  };

  // ── Step 2: Local pre-validation (no network, no gas) ────
  const dailySpent = spendTracker.getDailySpent();
  const validation = validatePayment(request, activePolicy, dailySpent);

  if (!validation.valid) {
    const response: PayResponse = {
      status: "rejected",
      rejection_code: validation.rejection_code,
      reason: validation.reason,
      daily_spent: dailySpent,
      daily_remaining: spendTracker.getRemaining(activePolicy.daily_cap),
      timestamp,
    };
    logPaymentAttempt(request, response, dailySpent);
    return res.status(200).json(response);
  }

  // ── Step 3: On-chain contract call ────────────────────────
  // The contract re-enforces all three rules before transferring.
  // If it rejects, callPayContract throws with a parsed error message.
  try {
    const { tx_hash, nullifier_hash } = await callPayContract(
      request.amount,
      request.recipient,
      request.reason
    );

    // ── Step 4: Record the spend locally ─────────────────
    spendTracker.recordSpend(request.amount);
    const newDailySpent = spendTracker.getDailySpent();

    const response: PayResponse = {
      status: "approved",
      tx_hash,
      nullifier_hash,
      daily_spent: newDailySpent,
      daily_remaining: spendTracker.getRemaining(activePolicy.daily_cap),
      timestamp,
    };

    logPaymentAttempt(request, response, newDailySpent);
    return res.status(200).json(response);

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Map contract error string → rejection_code for the UI
    let rejection_code: PayResponse["rejection_code"] = "CONTRACT_ERROR";
    if (errMsg.includes("max_per_tx")) rejection_code = "MAX_TX_EXCEEDED";
    else if (errMsg.includes("daily_cap")) rejection_code = "DAILY_CAP_EXCEEDED";
    else if (errMsg.includes("allowed_destinations")) rejection_code = "DISALLOWED_RECIPIENT";

    const response: PayResponse = {
      status: "rejected",
      rejection_code,
      reason: errMsg,
      daily_spent: dailySpent,
      daily_remaining: spendTracker.getRemaining(activePolicy.daily_cap),
      timestamp,
    };

    logPaymentAttempt(request, response, dailySpent);
    return res.status(200).json(response);
  }
});

/** Expose active policy for other modules (e.g. status route) */
export function getActivePolicy(): PolicyConfig {
  return activePolicy;
}

export function getPolicySource(): "contract" | "config" {
  return policySource;
}

export default router;
