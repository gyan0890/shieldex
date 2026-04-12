// ============================================================
// policy.ts — Pure policy validation logic (zero network calls)
// All three contract rules are enforced here before any Stellar
// call is made, giving us fast pre-rejection without spending gas.
// ============================================================

import { PayRequest, PolicyConfig, RejectionCode } from "./types";

export interface ValidationResult {
  valid: boolean;
  rejection_code?: RejectionCode;
  reason?: string;
}

/**
 * Validates a payment request against the active policy and today's spend.
 *
 * Mirrors the contract's three-rule check order exactly:
 *   1. amount <= max_per_tx          → ExceedsMaxPerTx
 *   2. daily_spent + amount <= daily_cap → ExceedsDailyCap
 *   3. recipient IN allowed_destinations → RecipientNotAllowed
 *
 * This runs before the Soroban call so policy violations are caught
 * locally and logged without consuming any network/gas resources.
 */
export function validatePayment(
  request: PayRequest,
  policy: PolicyConfig,
  dailySpent: number
): ValidationResult {
  // Guard: amount must be positive
  if (request.amount <= 0) {
    return {
      valid: false,
      rejection_code: "INVALID_AMOUNT",
      reason: `Payment amount must be > 0. Received: ${request.amount}`,
    };
  }

  // Rule 1: Single transaction cap (mirrors ExceedsMaxPerTx)
  if (request.amount > policy.max_per_tx) {
    return {
      valid: false,
      rejection_code: "MAX_TX_EXCEEDED",
      reason:
        `Payment of ${request.amount} ${policy.currency} exceeds the per-transaction ` +
        `limit of ${policy.max_per_tx} ${policy.currency}`,
    };
  }

  // Rule 2: Rolling daily cap (mirrors ExceedsDailyCap)
  const projectedTotal = dailySpent + request.amount;
  if (projectedTotal > policy.daily_cap) {
    return {
      valid: false,
      rejection_code: "DAILY_CAP_EXCEEDED",
      reason:
        `Payment of ${request.amount} ${policy.currency} would push daily spend ` +
        `to ${projectedTotal.toFixed(2)}, exceeding the cap of ${policy.daily_cap} ${policy.currency}. ` +
        `Already spent today: ${dailySpent.toFixed(2)}`,
    };
  }

  // Rule 3: Allowed destinations (mirrors RecipientNotAllowed)
  // ["*"] means any recipient is permitted (open policy)
  if (
    !policy.allowed_destinations.includes("*") &&
    !policy.allowed_destinations.includes(request.recipient)
  ) {
    return {
      valid: false,
      rejection_code: "DISALLOWED_RECIPIENT",
      reason: `Recipient ${request.recipient} is not in the allowed_destinations list`,
    };
  }

  return { valid: true };
}

/**
 * Loads policy from config.json.
 * Used as the initial policy source on startup.
 * Once the contract is confirmed live, getContractPolicy() in stellar.ts
 * takes over and this becomes a fallback only.
 */
export function loadPolicyFromConfig(configPath: string): PolicyConfig {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(configPath) as {
    policy: {
      max_per_tx: number;
      daily_cap: number;
      allowed_destinations: string[];
      currency?: string;
    };
  };

  return {
    max_per_tx: raw.policy.max_per_tx,
    daily_cap: raw.policy.daily_cap,
    allowed_destinations: raw.policy.allowed_destinations,
    currency: raw.policy.currency ?? "USDC",
  };
}
