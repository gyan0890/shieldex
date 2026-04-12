// ============================================================
// logger.ts — Append-only spend log
// Every payment attempt (approved OR rejected) is logged here.
// Writes to console + a local JSON file (spend-log.json).
// ============================================================

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { PayRequest, PayResponse, SpendRecord } from "./types";

const LOG_FILE = path.resolve(__dirname, "../../spend-log.json");

/** Reads existing log or returns empty array */
function readLog(): SpendRecord[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    return JSON.parse(raw) as SpendRecord[];
  } catch {
    return [];
  }
}

/** Appends a record to the log file */
function appendToLog(record: SpendRecord): void {
  const existing = readLog();
  existing.push(record);
  fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

/**
 * Logs a payment attempt.
 * Call this after every POST /pay, regardless of outcome.
 */
export function logPaymentAttempt(
  request: PayRequest,
  response: PayResponse,
  dailySpentAfter?: number
): SpendRecord {
  const record: SpendRecord = {
    id: uuidv4(),
    timestamp: response.timestamp,
    amount: request.amount,
    recipient: request.recipient,
    reason: request.reason,
    status: response.status,
    tx_hash: response.tx_hash,
    nullifier_hash: response.nullifier_hash,
    rejection_code: response.rejection_code,
    daily_spent_after: dailySpentAfter,
  };

  // Console output
  const icon = response.status === "approved" ? "✅" : "🛑";
  const summary =
    response.status === "approved"
      ? `tx_hash=${response.tx_hash}`
      : `reason=${response.rejection_code}: ${response.reason}`;

  console.log(
    `${icon} [${record.timestamp}] ${response.status.toUpperCase()} | ` +
    `${request.amount} USDC → ${request.recipient} | "${request.reason}" | ${summary}`
  );

  // File output
  appendToLog(record);

  return record;
}

/** Returns the full spend log (for a /history endpoint or debugging) */
export function getSpendLog(): SpendRecord[] {
  return readLog();
}

/** Returns only rejected records (useful for auditing policy breaches) */
export function getRejectedLog(): SpendRecord[] {
  return readLog().filter((r) => r.status === "rejected");
}
