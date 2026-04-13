/**
 * GET /api/shieldex/status/balance
 * Returns the live USDC balance of the agent wallet contract.
 */

import { getSorobanBalance } from "@/lib/soroban";

export async function GET() {
  try {
    const data = await getSorobanBalance();
    return Response.json(data);
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
