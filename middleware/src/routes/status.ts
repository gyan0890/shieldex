// ============================================================
// routes/status.ts
//
// GET /status          — Active policy + today's spend summary
// GET /status/balance  — Live on-chain contract balance
// GET /status/history  — Full spend log (optional ?filter=rejected)
// ============================================================

import { Router, Request, Response } from "express";
import { spendTracker } from "../spendTracker";
import { getSpendLog, getRejectedLog } from "../logger";
import { getContractState } from "../stellar";
import { getActivePolicy, getPolicySource } from "./pay";

const router = Router();

/**
 * GET /status
 *
 * Returns the active spending policy and today's spend status.
 * Person C's dashboard polls this every few seconds to update the live feed.
 *
 * Response includes:
 *   - policy_source: "contract" | "config" (so the UI can show a badge)
 *   - policy: the active PolicyConfig
 *   - today: { date, spent, remaining, cap }
 */
router.get("/", (_req: Request, res: Response) => {
  const policy = getActivePolicy();
  const today = spendTracker.getStatus(policy.daily_cap);

  res.json({
    ok: true,
    policy_source: getPolicySource(),
    policy: {
      max_per_tx: policy.max_per_tx,
      daily_cap: policy.daily_cap,
      allowed_destinations: policy.allowed_destinations,
      currency: policy.currency,
    },
    today,
  });
});

/**
 * GET /status/balance
 *
 * Reads the contract's live USDC balance and on-chain daily spend via
 * get_balance() and get_daily_spent().
 *
 * Useful for Person C's "wallet health" panel and for cross-checking
 * the middleware's local spend tracker against the contract's own view.
 */
router.get("/balance", async (_req: Request, res: Response) => {
  try {
    const state = await getContractState();
    res.json({
      ok: true,
      contract_balance_usdc: state.balance_usdc,
      contract_daily_spent_usdc: state.daily_spent_usdc,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      ok: false,
      error: `Could not read contract state: ${msg}`,
    });
  }
});

/**
 * GET /status/history
 * GET /status/history?filter=rejected
 *
 * Returns the full spend log from spend-log.json.
 * With ?filter=rejected, returns only policy-breach records —
 * used by Person C's "Violations" panel and the hack simulation demo.
 */
router.get("/history", (req: Request, res: Response) => {
  const filter = req.query.filter as string | undefined;
  const records = filter === "rejected" ? getRejectedLog() : getSpendLog();

  res.json({
    ok: true,
    filter: filter ?? "all",
    count: records.length,
    records,
  });
});

export default router;
