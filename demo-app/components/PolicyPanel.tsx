"use client";

import { PolicyStatus, BalanceStatus, shortenAddress } from "@/lib/api";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

interface Props {
  status: PolicyStatus | null;
  balance: BalanceStatus | null;
}

export default function PolicyPanel({ status, balance }: Props) {
  const spent = status?.today.spent ?? 0;
  const cap = status?.today.cap ?? 1;
  const pct = Math.min((spent / cap) * 100, 100);

  const barColor =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-400" : "bg-cyan-400";

  return (
    <div className="bg-[#0d1a26] border border-cyan-900/40 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
          Active Policy
        </h2>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            status?.policy_source === "contract"
              ? "bg-cyan-900/50 text-cyan-300"
              : "bg-yellow-900/50 text-yellow-300"
          }`}
        >
          {status?.policy_source === "contract" ? "On-chain" : "Local config"}
        </span>
      </div>

      {/* Limits */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0a1520] rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            Max per tx
          </p>
          <p className="text-xl font-bold text-white">
            ${status?.policy.max_per_tx.toFixed(2) ?? "—"}
          </p>
          <p className="text-[10px] text-slate-500">USDC</p>
        </div>
        <div className="bg-[#0a1520] rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            Daily cap
          </p>
          <p className="text-xl font-bold text-white">
            ${status?.policy.daily_cap.toFixed(2) ?? "—"}
          </p>
          <p className="text-[10px] text-slate-500">USDC</p>
        </div>
      </div>

      {/* Daily spend bar */}
      <div>
        <div className="flex justify-between text-[11px] mb-2">
          <span className="text-slate-400">Today&apos;s spend</span>
          <span className="text-white font-bold">
            ${spent.toFixed(2)}{" "}
            <span className="text-slate-500 font-normal">/ ${cap.toFixed(2)}</span>
          </span>
        </div>
        <div className="h-2 bg-[#0a1520] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-slate-600">0%</span>
          <span className={pct >= 90 ? "text-red-400 font-bold" : "text-slate-600"}>
            {pct.toFixed(0)}% used
          </span>
          <span className="text-slate-600">100%</span>
        </div>
      </div>

      {/* On-chain balance */}
      <div className="bg-[#0a1520] rounded-lg p-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
          Wallet balance
        </p>
        {balance ? (
          <p className="text-lg font-bold text-green-400">
            ${balance.contract_balance_usdc.toFixed(4)}{" "}
            <span className="text-slate-500 text-xs font-normal">USDC</span>
          </p>
        ) : (
          <p className="text-slate-600 text-sm">Loading…</p>
        )}
      </div>

      {/* Contract address */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
          Contract
        </p>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-cyan-500 hover:text-cyan-300 font-mono transition-colors"
        >
          {shortenAddress(CONTRACT)} ↗
        </a>
      </div>

      {/* Allowed destinations */}
      {status?.policy.allowed_destinations && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
            Allowed destinations
          </p>
          <div className="space-y-1">
            {status.policy.allowed_destinations.map((addr, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                <span className="text-[11px] font-mono text-slate-400">
                  {addr === "*" ? "Any address (open policy)" : shortenAddress(addr)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
