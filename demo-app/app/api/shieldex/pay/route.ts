/**
 * POST /api/shieldex/pay
 *
 * Thin HTTP wrapper around the shared Soroban pay logic in lib/soroban.ts.
 * Keeping this route means the client-side "attack" buttons still work.
 *
 * Body: { amount: number, recipient: string, reason: string }
 */

import { callSorobanPay } from "@/lib/soroban";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    amount?: number;
    recipient?: string;
    reason?: string;
  };

  const { amount, recipient, reason } = body;

  if (!amount || !recipient || !reason) {
    return Response.json(
      {
        status: "rejected",
        rejection_code: "INVALID_REQUEST",
        reason: "amount, recipient, and reason are required",
      },
      { status: 400 }
    );
  }

  const result = await callSorobanPay(amount, recipient, reason);
  return Response.json(result);
}
