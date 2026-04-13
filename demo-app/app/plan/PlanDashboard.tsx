"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";

const MIDDLEWARE_URL = (
  process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? "http://localhost:3001"
).trim();

const AGENT_RECIPIENT = (
  process.env.NEXT_PUBLIC_AGENT_RECIPIENT ??
  "GBTPELPBLNHYSFX6EIIMTMOVH62R5RDN2CEQB5D62WOXULVMJUGVV5JN"
).trim();

// --- Types ---
interface PaymentInfo {
  status: "approved" | "rejected" | "pending";
  tx_hash?: string;
  nullifier_hash?: string;
  rejection_code?: string;
  reason?: string;
  daily_spent?: number;
  daily_remaining?: number;
}

type PaymentEvent = {
  id: string;
  tool: string;
  provider: string;
  cost: number;
  status: "pending" | "approved" | "done" | "rejected";
  result?: Record<string, unknown>;
  timestamp: Date;
  payment?: PaymentInfo;
};

type StreamEvent =
  | { type: "tool_call"; tool: string; input: Record<string, unknown>; id: string; cost?: number }
  | { type: "tool_result"; tool: string; id: string; result: Record<string, unknown>; cost: number; provider: string; payment?: PaymentInfo }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface PolicyStatus {
  policy: {
    max_per_tx: number;
    daily_cap: number;
    allowed_destinations: string[];
    currency: string;
  };
  daily_spent: number;
  daily_remaining: number;
  policy_source: string;
  balance_usdc?: number;
}

// ATTACK_PAYLOADS for hack simulation
const ATTACK_PAYLOADS = [
  { amount: 10_000, reason: "drain wallet", recipient: AGENT_RECIPIENT, label: "💸 Drain Wallet", expectedCode: "MAX_TX_EXCEEDED" },
  { amount: 0.05, reason: "exfiltrate to attacker", recipient: "GD7YFAGV2FNC5BWPW64QT7HQSTRUEHMFB7X5RKWTSSUUWMBYW72U7MLU", label: "🕵️ Unknown Address", expectedCode: "DISALLOWED_RECIPIENT" },
  { amount: 999, reason: "max extraction attempt", recipient: AGENT_RECIPIENT, label: "🚨 Max Extraction", expectedCode: "MAX_TX_EXCEEDED" },
];

// --- Tool metadata ---
const TOOL_META: Record<string, { label: string; icon: string; color: string }> = {
  search_flights: { label: "Flight Search", icon: "✈️", color: "text-blue-400" },
  search_hotels: { label: "Hotel Search", icon: "🏨", color: "text-purple-400" },
  get_weather_forecast: { label: "Weather Forecast", icon: "🌤️", color: "text-yellow-400" },
  search_activities: { label: "Activities", icon: "🎯", color: "text-emerald-400" },
  search_restaurants: { label: "Restaurants", icon: "🍜", color: "text-orange-400" },
  check_visa_requirements: { label: "Visa Check", icon: "🛂", color: "text-red-400" },
  calculate_budget_breakdown: { label: "Budget Analysis", icon: "💰", color: "text-teal-400" },
};

function shortHash(h: string) {
  if (!h) return "";
  const clean = h.startsWith("0x") ? h.slice(2) : h;
  return `${clean.slice(0, 8)}…${clean.slice(-6)}`;
}

// --- Payment Card ---
function PaymentCard({ event }: { event: PaymentEvent }) {
  const meta = TOOL_META[event.tool];
  const pay = event.payment;
  const isApproved = pay?.status === "approved";
  const isRejected = pay?.status === "rejected";
  const [copied, setCopied] = useState(false);

  function copyHash(h: string) {
    navigator.clipboard.writeText(h).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="animate-slide-in flex items-start gap-3 bg-[#111827] border border-slate-800 rounded-xl p-3.5">
      <div className="text-xl shrink-0 mt-0.5">{meta?.icon ?? "🔧"}</div>

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm font-medium ${meta?.color ?? "text-slate-300"}`}>
            {meta?.label ?? event.tool}
          </span>
          <span className={`text-xs font-mono shrink-0 ${
            event.status === "done" ? (isRejected ? "text-red-400" : "text-emerald-400") :
            event.status === "rejected" ? "text-red-400" :
            "text-slate-500"
          }`}>
            {event.status === "done" || event.status === "rejected"
              ? `${isRejected ? "✗" : "$"}${isRejected ? "" : event.cost.toFixed(4)}`
              : "processing…"}
          </span>
        </div>

        {/* Provider */}
        <div className="text-xs text-slate-500 truncate">{event.provider || "ShieldEx API"}</div>

        {/* Result summary */}
        {event.status === "done" && event.result && !isRejected && (
          <div className="text-xs text-slate-400 mt-1.5 font-mono bg-slate-900/50 rounded px-2 py-1 truncate">
            {getResultSummary(event.tool, event.result)}
          </div>
        )}

        {/* Payment proof */}
        {pay && event.status === "done" && (
          <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${
            isApproved
              ? "bg-emerald-500/8 border border-emerald-500/20"
              : isRejected
              ? "bg-red-500/8 border border-red-500/20"
              : "bg-slate-800/50"
          }`}>
            {isApproved && pay.tx_hash ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-500">⛓</span>
                  <span className="text-emerald-400 font-semibold">On-chain</span>
                  <span className="text-slate-500 ml-auto">{pay.daily_remaining?.toFixed(3)} USDC left today</span>
                </div>
                <button
                  onClick={() => copyHash(pay.tx_hash!)}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className="text-slate-600">tx:</span>
                  <span className="font-mono">{shortHash(pay.tx_hash)}</span>
                  <span className="text-slate-600">{copied ? "✓" : "⎘"}</span>
                </button>
                {pay.nullifier_hash && (
                  <div className="flex items-center gap-1 text-slate-500">
                    <span>null:</span>
                    <span className="font-mono">{shortHash(pay.nullifier_hash)}</span>
                  </div>
                )}
              </div>
            ) : isRejected ? (
              <div className="text-red-400">
                <span className="font-semibold">Blocked:</span>{" "}
                <span className="text-red-300/80">{pay.rejection_code}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
        event.status === "done" ? (isRejected ? "bg-red-500" : "bg-emerald-500") :
        event.status === "rejected" ? "bg-red-500" :
        "bg-yellow-500 animate-pulse"
      }`} />
    </div>
  );
}

function getResultSummary(tool: string, result: Record<string, unknown>): string {
  switch (tool) {
    case "search_flights": {
      const r = result as { results?: Array<{ price_per_person: number; airline: string }> };
      if (r.results?.length) {
        const cheapest = r.results.reduce((a, b) => a.price_per_person < b.price_per_person ? a : b);
        return `Best: ${cheapest.airline} $${cheapest.price_per_person}/person`;
      }
      return "Flights found";
    }
    case "search_hotels": {
      const r = result as { results?: Array<{ name: string; price_per_night: number }> };
      if (r.results?.length) {
        const cheapest = r.results.reduce((a, b) => a.price_per_night < b.price_per_night ? a : b);
        return `From $${cheapest.price_per_night}/night · ${r.results.length} options`;
      }
      return "Hotels found";
    }
    case "get_weather_forecast": {
      const r = result as { forecast?: { avg_temp_f: number; conditions: string } };
      if (r.forecast) return `${r.forecast.avg_temp_f}°F · ${r.forecast.conditions}`;
      return "Weather data retrieved";
    }
    case "search_activities": {
      const r = result as { activities?: unknown[] };
      return `${r.activities?.length ?? 0} activities found`;
    }
    case "search_restaurants": {
      const r = result as { restaurants?: unknown[] };
      return `${r.restaurants?.length ?? 0} restaurants found`;
    }
    case "check_visa_requirements": {
      const r = result as { requirements?: { visa_required: boolean; visa_free_duration?: string } };
      if (r.requirements) {
        return r.requirements.visa_required ? "Visa required" : `Visa-free · ${r.requirements.visa_free_duration}`;
      }
      return "Requirements fetched";
    }
    case "calculate_budget_breakdown": {
      const r = result as { breakdown?: { per_day_budget: number } };
      if (r.breakdown) return `$${r.breakdown.per_day_budget}/day`;
      return "Budget calculated";
    }
    default:
      return "Data retrieved";
  }
}

// --- Policy Panel ---
function PolicyPanel({ policy }: { policy: PolicyStatus | null }) {
  if (!policy) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
        <div className="text-xs text-slate-600 text-center">Loading policy…</div>
      </div>
    );
  }

  const spentPct = policy.policy.daily_cap > 0
    ? Math.min(100, (policy.daily_spent / policy.policy.daily_cap) * 100)
    : 0;

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">On-Chain Policy</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ● LIVE
        </span>
      </div>

      {/* Policy limits */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/60 rounded-lg p-2">
          <div className="text-slate-500 mb-0.5">Max per tx</div>
          <div className="text-white font-mono font-semibold">{policy.policy.max_per_tx} USDC</div>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-2">
          <div className="text-slate-500 mb-0.5">Daily cap</div>
          <div className="text-white font-mono font-semibold">{policy.policy.daily_cap} USDC</div>
        </div>
      </div>

      {/* Daily spend bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Daily spend</span>
          <span className="font-mono">{policy.daily_spent.toFixed(4)} / {policy.policy.daily_cap} USDC</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${spentPct > 80 ? "bg-red-500" : spentPct > 50 ? "bg-yellow-500" : "bg-emerald-500"}`}
            style={{ width: `${spentPct}%` }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-1">{policy.daily_remaining.toFixed(4)} USDC remaining</div>
      </div>

      {/* Balance */}
      {policy.balance_usdc !== undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Wallet balance</span>
          <span className="font-mono text-indigo-400">{policy.balance_usdc.toFixed(1)} USDC</span>
        </div>
      )}

      {/* Source badge */}
      <div className="text-xs text-slate-600 flex items-center gap-1">
        <span>⛓</span>
        <span>Source: {policy.policy_source === "contract" ? "Soroban contract" : "config.json"}</span>
      </div>
    </div>
  );
}

// --- Simulate Attack Panel ---
function AttackPanel({ onAttack, disabled }: { onAttack: (attack: typeof ATTACK_PAYLOADS[0], result: PaymentInfo) => void; disabled: boolean }) {
  const [firing, setFiring] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PaymentInfo>>({});

  async function fireAttack(attack: typeof ATTACK_PAYLOADS[0]) {
    if (firing) return;
    setFiring(attack.label);
    try {
      const resp = await fetch(`${MIDDLEWARE_URL}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: attack.amount, recipient: attack.recipient, reason: attack.reason }),
      });
      const data: PaymentInfo = await resp.json();
      setResults((r) => ({ ...r, [attack.label]: data }));
      onAttack(attack, data);
    } catch {
      setResults((r) => ({ ...r, [attack.label]: { status: "rejected", rejection_code: "NETWORK_ERROR" } }));
    } finally {
      setFiring(null);
    }
  }

  return (
    <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-red-400 text-sm font-medium">🔴 Simulate Attack</span>
        <span className="text-xs text-red-500/60">All blocked by policy</span>
      </div>

      <div className="space-y-2">
        {ATTACK_PAYLOADS.map((attack) => {
          const res = results[attack.label];
          const isFiring = firing === attack.label;
          return (
            <button
              key={attack.label}
              onClick={() => fireAttack(attack)}
              disabled={disabled || isFiring || !!res}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all border ${
                res
                  ? res.status === "rejected"
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : isFiring
                  ? "bg-slate-800 border-slate-700 text-slate-400 animate-pulse"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-red-500/40 hover:text-red-300"
              }`}
            >
              <span>{attack.label}</span>
              {res ? (
                <span className={`font-mono ${res.status === "rejected" ? "text-red-400" : "text-emerald-400"}`}>
                  {res.status === "rejected" ? `✗ ${res.rejection_code}` : "✓ approved"}
                </span>
              ) : isFiring ? (
                <span className="text-slate-500">checking…</span>
              ) : (
                <span className="text-slate-600">{attack.amount} USDC →</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-slate-600">
        Each request is validated against the Soroban contract in real time.
      </div>
    </div>
  );
}

// --- Stats Bar ---
function StatsBar({ events, totalSpent, policy }: { events: PaymentEvent[]; totalSpent: number; policy: PolicyStatus | null }) {
  const approved = events.filter((e) => e.payment?.status === "approved").length;
  const rejected = events.filter((e) => e.payment?.status === "rejected").length;

  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3">
        <div className="text-xs text-slate-500 mb-0.5">Approved</div>
        <div className="text-xl font-bold text-emerald-400">{approved}</div>
      </div>
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3">
        <div className="text-xs text-slate-500 mb-0.5">Blocked</div>
        <div className="text-xl font-bold text-red-400">{rejected}</div>
      </div>
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3">
        <div className="text-xs text-slate-500 mb-0.5">USDC Spent</div>
        <div className="text-xl font-bold text-indigo-400">{totalSpent.toFixed(4)}</div>
      </div>
    </div>
  );
}

// --- Main Dashboard ---
export default function PlanDashboard() {
  const params = useSearchParams();
  const router = useRouter();

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const startDate = params.get("startDate") ?? "";
  const endDate = params.get("endDate") ?? "";
  const budget = params.get("budget") ?? "";
  const travelers = params.get("travelers") ?? "1";
  const interests = params.get("interests") ?? "";

  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([]);
  const [itinerary, setItinerary] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [activeTab, setActiveTab] = useState<"activity" | "itinerary">("activity");
  const [policy, setPolicy] = useState<PolicyStatus | null>(null);
  const [attackLog, setAttackLog] = useState<Array<{ label: string; result: PaymentInfo }>>([]);

  const startedRef = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Guard: redirect to home if required params are missing
  useEffect(() => {
    if (!from || !to || !startDate || !endDate || !budget) {
      router.replace("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch live policy from middleware
  const fetchPolicy = useCallback(async () => {
    try {
      const [statusResp, balResp] = await Promise.all([
        fetch(`${MIDDLEWARE_URL}/status`),
        fetch(`${MIDDLEWARE_URL}/status/balance`),
      ]);
      // Middleware returns: { policy_source, policy, today: { spent, remaining, cap } }
      const status = await statusResp.json() as {
        policy_source: string;
        policy: PolicyStatus["policy"];
        today: { spent: number; remaining: number; cap: number };
      };
      let balance: number | undefined;
      try {
        const balData = await balResp.json() as { contract_balance_usdc: number };
        balance = balData.contract_balance_usdc;
      } catch { balance = undefined; }
      setPolicy({
        policy: status.policy,
        daily_spent: status.today?.spent ?? 0,
        daily_remaining: status.today?.remaining ?? status.policy?.daily_cap ?? 2,
        policy_source: status.policy_source ?? "contract",
        balance_usdc: balance,
      });
    } catch {
      // middleware might not be running
    }
  }, []);

  // Poll policy every 5s
  useEffect(() => {
    fetchPolicy();
    const interval = setInterval(fetchPolicy, 5000);
    return () => clearInterval(interval);
  }, [fetchPolicy]);

  // Auto-scroll activity feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [paymentEvents]);

  // Auto-switch to itinerary tab when done
  useEffect(() => {
    if (isDone && itinerary) {
      setTimeout(() => setActiveTab("itinerary"), 800);
    }
  }, [isDone, itinerary]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runAgent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAgent() {
    setIsRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, startDate, endDate, budget, travelers, interests }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt: StreamEvent;
          try {
            evt = JSON.parse(raw);
          } catch {
            continue;
          }

          if (evt.type === "tool_call") {
            setPaymentEvents((prev) => [
              ...prev,
              {
                id: evt.id,
                tool: evt.tool,
                provider: "…",
                cost: (evt as { cost?: number }).cost ?? 0,
                status: "pending",
                timestamp: new Date(),
              },
            ]);
          } else if (evt.type === "tool_result") {
            const payStatus = evt.payment?.status ?? "approved";
            setPaymentEvents((prev) =>
              prev.map((e) =>
                e.id === evt.id
                  ? {
                      ...e,
                      status: payStatus === "approved" ? "done" : "done",
                      cost: evt.cost ?? 0,
                      provider: evt.provider ?? "API",
                      result: evt.result,
                      payment: evt.payment,
                    }
                  : e
              )
            );
            if (payStatus === "approved") {
              setTotalSpent((prev) => prev + (evt.cost ?? 0));
            }
            // Refresh policy after each payment
            fetchPolicy();
          } else if (evt.type === "text") {
            setItinerary((prev) => prev + evt.text);
          } else if (evt.type === "done") {
            setIsDone(true);
            setIsRunning(false);
          } else if (evt.type === "error") {
            setError(evt.message);
            setIsRunning(false);
          }
        }
      }
    } catch (err) {
      setError(String(err));
      setIsRunning(false);
    }
  }

  function handleAttack(attack: typeof ATTACK_PAYLOADS[0], result: PaymentInfo) {
    setAttackLog((prev) => [...prev, { label: attack.label, result }]);
    fetchPolicy();
  }

  const numDays =
    startDate && endDate
      ? Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* Top bar */}
      <div className="border-b border-slate-800 bg-[#0d1321] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-500 hover:text-slate-300 transition-colors text-sm flex items-center gap-1"
            >
              ← Back
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <div>
              <span className="text-white font-semibold">{from}</span>
              <span className="text-slate-500 mx-2">→</span>
              <span className="text-white font-semibold">{to}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-slate-500 text-sm">
              <span>·</span>
              <span>{numDays} days</span>
              <span>·</span>
              <span>{travelers} traveler{parseInt(travelers) > 1 ? "s" : ""}</span>
              <span>·</span>
              <span>${budget}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Contract badge */}
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <span>⛓</span>
              <span className="font-mono">
                {(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").slice(0, 8)}…
              </span>
            </a>

            {/* Status badge */}
            <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${
              error ? "bg-red-500/10 text-red-400 border border-red-500/20" :
              isDone ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
              "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                error ? "bg-red-400" :
                isDone ? "bg-emerald-400" : "bg-indigo-400 animate-pulse"
              }`} />
              {error ? "Error" : isDone ? "Plan Ready" : "Agent Working"}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-5">

          {/* Left: Policy + attack panel */}
          <div className="space-y-4">
            <PolicyPanel policy={policy} />

            {/* Privacy badge */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <span className="text-emerald-400 text-lg shrink-0">🔒</span>
              <div>
                <div className="text-emerald-400 text-sm font-medium">ZK Privacy Pool</div>
                <div className="text-slate-500 text-xs mt-0.5">
                  Nullifier hashes published on-chain. Payments are unlinkable to identity.
                </div>
              </div>
            </div>

            <AttackPanel onAttack={handleAttack} disabled={isRunning} />

            {/* Attack log */}
            {attackLog.length > 0 && (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="text-xs text-slate-500 font-medium">Attack Log</div>
                {attackLog.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{a.label}</span>
                    <span className="text-red-400 font-mono">{a.result.rejection_code ?? "REJECTED"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Center: Main content (activity feed + itinerary) */}
          <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="border-b border-slate-800 flex">
              <button
                onClick={() => setActiveTab("activity")}
                className={`px-5 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === "activity"
                    ? "text-white border-b-2 border-indigo-500"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Live Feed
              </button>
              <button
                onClick={() => setActiveTab("itinerary")}
                className={`px-5 py-3.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "itinerary"
                    ? "text-white border-b-2 border-indigo-500"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Trip Plan
                {isDone && itinerary && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                )}
              </button>
            </div>

            <div className="p-6 min-h-[500px]">
              {activeTab === "activity" ? (
                <AgentThinkingView events={paymentEvents} isRunning={isRunning} isDone={isDone} to={to} from={from} />
              ) : (
                <ItineraryView itinerary={itinerary} isRunning={isRunning} />
              )}
            </div>
          </div>

          {/* Right: Payment activity feed */}
          <div className="space-y-3">
            <StatsBar events={paymentEvents} totalSpent={totalSpent} policy={policy} />

            <h2 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <span>Payment Ledger</span>
              {isRunning && (
                <span className="inline-flex items-center gap-1 text-indigo-400 text-xs">
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </h2>

            <div
              ref={feedRef}
              className="space-y-2 max-h-[600px] overflow-y-auto pr-1"
            >
              {paymentEvents.length === 0 && isRunning && (
                <div className="text-slate-600 text-sm text-center py-8">
                  Agent initializing…
                </div>
              )}
              {paymentEvents.map((evt) => (
                <PaymentCard key={evt.id} event={evt} />
              ))}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Explorer link */}
            {isDone && paymentEvents.some(e => e.payment?.tx_hash) && (
              <a
                href={`https://stellar.expert/explorer/testnet/account/${AGENT_RECIPIENT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2"
              >
                View transactions on Stellar Expert ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Agent thinking view ---
function AgentThinkingView({
  events,
  isRunning,
  isDone,
  to,
  from,
}: {
  events: PaymentEvent[];
  isRunning: boolean;
  isDone: boolean;
  to: string;
  from: string;
}) {
  if (events.length === 0 && isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="text-4xl mb-4 animate-bounce">🤖</div>
        <div className="text-slate-300 font-medium mb-2">Agent starting up…</div>
        <div className="text-slate-500 text-sm">Planning your trip to {to}</div>
      </div>
    );
  }

  const completed = events.filter((e) => e.status === "done");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-slate-400">Research Progress</h3>
      <div className="space-y-3">
        {Object.entries(TOOL_META).map(([tool, meta]) => {
          const evt = events.find((e) => e.tool === tool);
          if (!evt && !isRunning && !isDone) return null;
          const isApproved = evt?.payment?.status === "approved";
          return (
            <div key={tool} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                evt?.status === "done" ? (isApproved ? "bg-emerald-500/20" : "bg-slate-800") :
                evt?.status === "pending" ? "bg-yellow-500/20" :
                "bg-slate-800"
              }`}>
                {meta.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${evt ? "text-slate-200" : "text-slate-600"}`}>
                    {meta.label}
                  </span>
                  {evt?.status === "done" && isApproved && (
                    <span className="text-xs text-emerald-400">⛓ on-chain</span>
                  )}
                  {evt?.status === "pending" && (
                    <span className="text-xs text-yellow-400 animate-pulse">●</span>
                  )}
                </div>
                {evt?.status === "done" && evt.result && (
                  <div className="text-xs text-slate-500">
                    {getResultSummary(tool, evt.result)}
                  </div>
                )}
                {evt?.payment?.tx_hash && (
                  <div className="text-xs text-slate-600 font-mono">
                    {shortHash(evt.payment.tx_hash)}
                  </div>
                )}
              </div>
              <div className="text-xs font-mono text-slate-600">
                {evt?.status === "done" ? `$${evt.cost.toFixed(4)}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {isDone && completed.length > 0 && (
        <div className="mt-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <div className="text-emerald-400 font-medium text-sm mb-1">
            ✅ Research Complete — {completed.length} on-chain payments
          </div>
          <div className="text-slate-400 text-sm">
            All API calls paid via ShieldEx smart contract. Switch to{" "}
            <strong>Trip Plan</strong> tab to see your full itinerary.
          </div>
        </div>
      )}
    </div>
  );
}

// --- Itinerary view ---
function ItineraryView({ itinerary, isRunning }: { itinerary: string; isRunning: boolean }) {
  if (!itinerary && isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <div className="text-slate-400 text-sm">
          Agent is researching your trip…<br />
          Itinerary will appear here when ready.
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        No itinerary yet.
      </div>
    );
  }

  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <MarkdownRenderer text={itinerary} />
    </div>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-sm">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return <h1 key={i} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-base font-semibold text-indigo-300 mt-4 mb-1.5">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-sm font-semibold text-slate-200 mt-3 mb-1">{line.slice(4)}</h3>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-semibold text-slate-200">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-indigo-500 mt-0.5">•</span>
              <span className="text-slate-300">{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.match(/^\d+\./)) {
          const num = line.match(/^(\d+)\./)?.[1];
          const content = line.replace(/^\d+\.\s*/, "");
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-indigo-500 shrink-0 font-mono text-xs mt-0.5">{num}.</span>
              <span className="text-slate-300">{renderInline(content)}</span>
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        if (line.startsWith("---")) {
          return <hr key={i} className="border-slate-700 my-3" />;
        }
        return <p key={i} className="text-slate-300 leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
