/**
 * GET /api/shieldex/status
 * Returns live policy + daily spend from the Soroban contract.
 */

import { getSorobanStatus } from "@/lib/soroban";

export async function GET() {
  try {
    const data = await getSorobanStatus();
    return Response.json(data);
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
