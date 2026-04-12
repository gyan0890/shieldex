// ============================================================
// types.ts — Shared types across the entire middleware
// Field names mirror the on-chain Soroban Policy struct exactly.
// ============================================================

/** Incoming payment request from the AI agent or demo app */
export interface PayRequest {
  amount: number;       // In USDC (e.g. 5.00)
  recipient: string;    // Stellar G-address
  reason: string;       // Human-readable reason e.g. "flight data API call"
}

/** Response sent back to the caller */
export interface PayResponse {
  status: "approved" | "rejected";
  tx_hash?: string;           // Stellar transaction hash (if approved)
  nullifier_hash?: string;    // 32-byte nullifier from contract (if approved)
  daily_spent?: number;       // Total USDC spent today
  daily_remaining?: number;   // USDC remaining in today's budget
  rejection_code?: RejectionCode;
  reason?: string;            // Human-readable rejection reason
  timestamp: string;          // ISO timestamp
}

/**
 * Machine-readable rejection codes.
 * Maps 1-to-1 with the contract's Error enum:
 *   ExceedsMaxPerTx      → MAX_TX_EXCEEDED
 *   ExceedsDailyCap      → DAILY_CAP_EXCEEDED
 *   RecipientNotAllowed  → DISALLOWED_RECIPIENT
 *   (middleware-level)   → INVALID_AMOUNT
 *   (network/runtime)    → CONTRACT_ERROR
 */
export type RejectionCode =
  | "MAX_TX_EXCEEDED"
  | "DAILY_CAP_EXCEEDED"
  | "DISALLOWED_RECIPIENT"
  | "INVALID_AMOUNT"
  | "CONTRACT_ERROR";

/**
 * Spending policy — mirrors the on-chain contract Policy struct:
 *   max_per_tx: i128            (stroops internally, exposed as USDC here)
 *   daily_cap: i128             (stroops internally, exposed as USDC here)
 *   allowed_destinations: Vec<Address>
 *   owner: Address
 */
export interface PolicyConfig {
  max_per_tx: number;               // Max USDC per single transaction
  daily_cap: number;                // Max USDC per calendar day (UTC)
  allowed_destinations: string[];   // Stellar G-addresses. ["*"] = allow any.
  currency: string;                 // "USDC"
}

/** On-chain balance + spend info (from contract read functions) */
export interface ContractState {
  balance_usdc: number;       // Current USDC balance in the contract
  daily_spent_usdc: number;   // i128 daily spend read directly from contract
}

/** A single entry in the spend log */
export interface SpendRecord {
  id: string;
  timestamp: string;
  amount: number;
  recipient: string;
  reason: string;
  status: "approved" | "rejected";
  tx_hash?: string;
  nullifier_hash?: string;
  rejection_code?: RejectionCode;
  daily_spent_after?: number;
}
