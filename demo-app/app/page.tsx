"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getStatus,
  getBalance,
  getHistory,
  healthCheck,
  PolicyStatus,
  BalanceStatus,
  SpendRecord,
} from "@/lib/api";
import PolicyPanel from "@/components/PolicyPanel";
import PaymentFeed from "@/components/PaymentFeed";
import DemoControls from "@/components/DemoControls";
import PrivacyPanel from "@/components/PrivacyPanel";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";
const MIDDLEWARE = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? "http://localhost:3001";

export default function HomePage() {
  const [status, setStatus]   = useState<PolicyStatus | null>(null);
  const [balance, setBalance] = useState<BalanceStatus | null>(null);
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [online, setOnline]   = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, h, b] = await Promise.all([getStatus(), getHistory(), getBalance()]);
      setStatus(s);
      setRecords(h.records);
      setBalance(b);
      setOnline(true);
      setLastRefresh(new Date());
    } catch {
      setOnline(false);
    }
  }, []);

  // Initial check + polling every 2.5 seconds
  useEffect(() => {
    (async () => {
      const alive = await healthCheck();
      setOnline(alive);
      if (alive) await refresh();
    })();

    intervalRef.current = setInterval(refresh, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const violations = records.filter((r) => r.status === "rejected").length;
  const approved   = records.filter((r) => r.status === "approved").length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-cyan-900/30 bg-[#070b0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡</span>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wider">
                ShieldEx
              </h1>
              <p className="text-[10px] text-slate-500">
                Privacy-Preserving Agent Payments · Stellar Testnet
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Live stats */}
            <div className="hidden sm:flex items-center gap-4 text-[11px]">
              <span className="text-green-400 font-bold">{approved} approved</span>
              <span className="text-slate-600">·</span>
              <span className="text-red-400 font-bold">{violations} blocked</span>
            </div>

            {/* Middleware status */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  online === null
                    ? "bg-yellow-400 animate-pulse"
                    : online
                    ? "bg-green-400 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="text-[10px] text-slate-500">
                {online === null
                  ? "Connecting…"
                  : online
                  ? `Middleware live`
                  : `Middleware offline`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Offline banner ─────────────────────────────────────── */}
      {online === false && (
        <div className="bg-red-900/30 border-b border-red-700/30 px-6 py-2 text-center text-[11px] text-red-300">
          Middleware not reachable at{" "}
          <code className="font-mono">{MIDDLEWARE}</code>. Run{" "}
          <code className="font-mono">cd middleware && npm run dev</code> first.
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 space-y-6">

        {/* Hero strip */}
        <div className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 border border-cyan-800/30 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">
              AI Travel Planner — Live Demo
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              An AI agent autonomously pays for weather, flight & news APIs.
              Every payment is policy-enforced on-chain. Identity always hidden.
            </p>
          </div>
          <div className="flex gap-3">
            <Stat label="Max/tx" value={`$${status?.policy.max_per_tx.toFixed(2) ?? "—"}`} color="cyan" />
            <Stat label="Daily cap" value={`$${status?.policy.daily_cap.toFixed(2) ?? "—"}`} color="purple" />
            <Stat label="Spent today" value={`$${status?.today.spent.toFixed(2) ?? "—"}`} color="green" />
          </div>
        </div>

        {/* ── Three-column layout ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: policy + controls */}
          <div className="space-y-6">
            <PolicyPanel status={status} balance={balance} />
            <DemoControls status={status} onAction={refresh} />
          </div>

          {/* Right: payment feed (spans 2 cols) */}
          <div className="lg:col-span-2 min-h-[500px]">
            <PaymentFeed records={records} />
          </div>
        </div>

        {/* ── Privacy panel ───────────────────────────────────── */}
        <PrivacyPanel />

        {/* ── Contract links footer ───────────────────────────── */}
        <div className="border-t border-cyan-900/20 pt-4 flex flex-wrap gap-4 text-[10px] text-slate-600">
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-400 transition-colors"
          >
            Agent Wallet Contract ↗
          </a>
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${process.env.NEXT_PUBLIC_PRIVACY_POOL_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-400 transition-colors"
          >
            Privacy Pool Contract ↗
          </a>
          <span className="ml-auto">
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : ""}
          </span>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "cyan" | "purple" | "green";
}) {
  const colors = {
    cyan:   "text-cyan-400",
    purple: "text-purple-400",
    green:  "text-green-400",
  };
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${colors[color]}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
