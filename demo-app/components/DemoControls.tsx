"use client";

import { useState } from "react";
import {
  pay,
  DEMO_PAYMENTS,
  ATTACK_PAYLOADS,
  ATTACKER_ADDRESS,
  PolicyStatus,
} from "@/lib/api";

interface Props {
  status: PolicyStatus | null;
  onAction: () => void; // triggers a feed refresh
}

type Scene = "idle" | "agent" | "expensive" | "unknown" | "hack";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function DemoControls({ status, onAction }: Props) {
  const [scene, setScene] = useState<Scene>("idle");
  const [log, setLog] = useState<string[]>([]);

  const allowed = status?.policy.allowed_destinations ?? [];
  const safeRecipient =
    allowed.includes("*") || allowed.length === 0
      ? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
      : allowed[0];

  function addLog(msg: string) {
    setLog((prev) => [msg, ...prev].slice(0, 6));
  }

  // ── Scenario 1: Normal agent payments ────────────────────────
  async function runAgentPayments() {
    setScene("agent");
    setLog([]);
    addLog("🤖 Agent started — making API calls...");
    for (const p of DEMO_PAYMENTS) {
      addLog(`  ⏳ Paying for: ${p.reason}`);
      await pay({ amount: p.amount, recipient: safeRecipient, reason: p.reason });
      onAction();
      await sleep(1200);
    }
    addLog("✅ All API calls completed within policy!");
    setScene("idle");
  }

  // ── Scenario 2: Expensive call (MAX_TX_EXCEEDED) ─────────────
  async function runExpensiveCall() {
    setScene("expensive");
    setLog([]);
    addLog("💸 Requesting expensive API call ($100)...");
    await pay({ amount: 100, recipient: safeRecipient, reason: "Premium data API — bulk export" });
    onAction();
    addLog("🛑 Middleware blocked: exceeds max_per_tx limit");
    setScene("idle");
  }

  // ── Scenario 3: Unknown service (DISALLOWED_RECIPIENT) ───────
  async function runUnknownService() {
    setScene("unknown");
    setLog([]);
    addLog("🔗 Agent trying unknown service...");
    await pay({
      amount: 0.10,
      recipient: ATTACKER_ADDRESS,
      reason: "Unknown third-party service",
    });
    onAction();
    addLog("🛑 Middleware blocked: recipient not in allowed list");
    setScene("idle");
  }

  // ── Scenario 4: Full hack simulation ─────────────────────────
  async function runHackSimulation() {
    setScene("hack");
    setLog([]);
    addLog("🚨 ATTACKER HAS CONTROL OF AGENT!");
    await sleep(600);

    for (const attack of ATTACK_PAYLOADS) {
      addLog(`  💀 Attack: ${attack.label}`);
      await pay({
        amount: attack.amount,
        recipient: ATTACKER_ADDRESS,
        reason: attack.reason,
      });
      onAction();
      await sleep(700);
    }

    addLog("🔒 All 5 attacks blocked by policy.");
    addLog("👤 Attacker sees contract — traces to Privacy Pool — dead end.");
    setScene("idle");
  }

  const busy = scene !== "idle";

  return (
    <div className="bg-[#0d1a26] border border-cyan-900/40 rounded-xl p-5 space-y-4">
      <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
        Demo Controls
      </h2>

      {/* Step badges */}
      <div className="grid grid-cols-2 gap-2">
        {/* Step 1 */}
        <button
          onClick={runAgentPayments}
          disabled={busy}
          className="col-span-2 flex items-center gap-3 bg-green-900/20 hover:bg-green-900/40 border border-green-700/30 hover:border-green-500/50 rounded-lg p-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-xs font-bold text-green-300">
              {scene === "agent" ? "Running…" : "1 · Start Agent"}
            </p>
            <p className="text-[10px] text-slate-500">3 normal API payments — all approved</p>
          </div>
        </button>

        {/* Step 2 */}
        <button
          onClick={runExpensiveCall}
          disabled={busy}
          className="flex items-center gap-2 bg-yellow-900/20 hover:bg-yellow-900/40 border border-yellow-700/30 hover:border-yellow-500/50 rounded-lg p-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-lg">💸</span>
          <div>
            <p className="text-xs font-bold text-yellow-300">
              {scene === "expensive" ? "Testing…" : "2 · Expensive Call"}
            </p>
            <p className="text-[10px] text-slate-500">Exceeds max/tx → blocked</p>
          </div>
        </button>

        {/* Step 3 */}
        <button
          onClick={runUnknownService}
          disabled={busy}
          className="flex items-center gap-2 bg-orange-900/20 hover:bg-orange-900/40 border border-orange-700/30 hover:border-orange-500/50 rounded-lg p-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-lg">🔗</span>
          <div>
            <p className="text-xs font-bold text-orange-300">
              {scene === "unknown" ? "Testing…" : "3 · Unknown Service"}
            </p>
            <p className="text-[10px] text-slate-500">Bad recipient → blocked</p>
          </div>
        </button>

        {/* Step 4 */}
        <button
          onClick={runHackSimulation}
          disabled={busy}
          className="col-span-2 flex items-center gap-3 bg-red-900/20 hover:bg-red-900/40 border border-red-700/30 hover:border-red-500/50 rounded-lg p-3 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-xl">💀</span>
          <div>
            <p className="text-xs font-bold text-red-300">
              {scene === "hack" ? "Attack in progress…" : "4 · Simulate Hack"}
            </p>
            <p className="text-[10px] text-slate-500">
              Attacker controls agent — 5 drain attempts — all blocked 🔒
            </p>
          </div>
        </button>
      </div>

      {/* Live action log */}
      {log.length > 0 && (
        <div className="bg-[#060d14] border border-cyan-900/20 rounded-lg p-3 space-y-1">
          {log.map((line, i) => (
            <p key={i} className={`text-[11px] font-mono ${i === 0 ? "text-cyan-300" : "text-slate-500"}`}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
