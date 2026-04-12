"use client";

import { SpendRecord, shortenAddress, shortenHash, timeAgo } from "@/lib/api";

interface Props {
  records: SpendRecord[];
}

const REJECTION_LABELS: Record<string, string> = {
  MAX_TX_EXCEEDED:      "Exceeds max/tx",
  DAILY_CAP_EXCEEDED:   "Daily cap hit",
  DISALLOWED_RECIPIENT: "Blocked recipient",
  INVALID_AMOUNT:       "Invalid amount",
  CONTRACT_ERROR:       "Contract error",
};

const REASON_ICONS: Record<string, string> = {
  "Weather API":    "🌤",
  "Flight data":    "✈",
  "News API":       "📰",
  "drain":          "💀",
  "exfiltrate":     "🚨",
  "extraction":     "⚠️",
  "daily cap":      "🛑",
  "repeated":       "🔁",
};

function getIcon(reason: string): string {
  for (const [key, icon] of Object.entries(REASON_ICONS)) {
    if (reason.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return "💳";
}

export default function PaymentFeed({ records }: Props) {
  const sorted = [...records].reverse(); // newest first

  return (
    <div className="bg-[#0d1a26] border border-cyan-900/40 rounded-xl p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
          Live Payment Feed
        </h2>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] text-slate-500">{records.length} total</span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600">
            <p className="text-2xl mb-2">💤</p>
            <p className="text-xs">No payments yet. Click a demo button to start.</p>
          </div>
        )}

        {sorted.map((r) => (
          <div
            key={r.id}
            className={`slide-in rounded-lg p-3 border text-[11px] ${
              r.status === "approved"
                ? "bg-green-950/30 border-green-700/30"
                : "bg-red-950/30 border-red-700/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              {/* Left: icon + reason */}
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-base shrink-0 mt-0.5">{getIcon(r.reason)}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-200 truncate">{r.reason}</p>
                  <p className="text-slate-500 font-mono truncate">
                    → {shortenAddress(r.recipient)}
                  </p>
                </div>
              </div>

              {/* Right: amount + status */}
              <div className="text-right shrink-0">
                <p className={`font-bold ${r.status === "approved" ? "text-green-400" : "text-red-400"}`}>
                  {r.status === "approved" ? "+" : "✗"} ${r.amount.toFixed(2)}
                </p>
                <p className="text-slate-600">{timeAgo(r.timestamp)}</p>
              </div>
            </div>

            {/* Bottom row */}
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between gap-2">
              {r.status === "approved" ? (
                <>
                  <span className="text-green-500 font-bold">✅ APPROVED</span>
                  {r.nullifier_hash && (
                    <span className="text-slate-600 font-mono">
                      🔒 {shortenHash(r.nullifier_hash)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-red-400 font-bold">🛑 REJECTED</span>
                  <span className="text-red-300/70">
                    {REJECTION_LABELS[r.rejection_code ?? ""] ?? r.rejection_code}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Stats footer */}
      {records.length > 0 && (
        <div className="mt-4 pt-3 border-t border-cyan-900/20 grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-green-400">
              {records.filter((r) => r.status === "approved").length}
            </p>
            <p className="text-[10px] text-slate-500 uppercase">Approved</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-400">
              {records.filter((r) => r.status === "rejected").length}
            </p>
            <p className="text-[10px] text-slate-500 uppercase">Blocked</p>
          </div>
        </div>
      )}
    </div>
  );
}
