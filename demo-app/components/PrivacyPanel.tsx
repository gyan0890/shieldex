"use client";

import { shortenAddress } from "@/lib/api";

const POOL = process.env.NEXT_PUBLIC_PRIVACY_POOL_ADDRESS ?? "";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

export default function PrivacyPanel() {
  return (
    <div className="bg-[#0d1a26] border border-cyan-900/40 rounded-xl p-5 space-y-4">
      <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
        Privacy Layer — What an Attacker Sees
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Without privacy pool */}
        <div className="bg-red-950/20 border border-red-700/30 rounded-lg p-4">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-3">
            ❌ Without ShieldEx
          </p>
          <div className="space-y-2 text-[11px] font-mono">
            <Chain
              steps={[
                { label: "Your Wallet", addr: "GA1234...ABCD", highlight: true },
                { label: "Agent Wallet", addr: shortenAddress(CONTRACT) },
                { label: "API Service", addr: "GBWEATHER...API" },
              ]}
              color="red"
            />
          </div>
          <p className="mt-3 text-[10px] text-red-300/70">
            On-chain trace links every payment directly back to your identity.
          </p>
        </div>

        {/* With privacy pool */}
        <div className="bg-green-950/20 border border-green-700/30 rounded-lg p-4">
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-3">
            ✅ With ShieldEx
          </p>
          <div className="space-y-2 text-[11px] font-mono">
            <Chain
              steps={[
                { label: "Your Wallet", addr: "GA1234...ABCD", highlight: true },
                { label: "Privacy Pool", addr: shortenAddress(POOL), private: true },
                { label: "Agent Wallet", addr: shortenAddress(CONTRACT) },
                { label: "API Service", addr: "GBWEATHER...API" },
              ]}
              color="green"
            />
          </div>
          <p className="mt-3 text-[10px] text-green-300/70">
            Funding routed through ZK pool. Trace stops at the pool — your identity is never revealed.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#0a1520] rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
          How the Privacy Pool works
        </p>
        <div className="grid grid-cols-3 gap-3 text-center text-[10px]">
          <Step n="1" title="Deposit" desc="You deposit USDC + a ZK commitment hash. No link to your address." />
          <Step n="2" title="ZK Proof" desc="A Groth16 proof proves you own a commitment without revealing which one." />
          <Step n="3" title="Fund Agent" desc="fund_agent_wallet() withdraws directly into the agent contract. Untraceable." />
        </div>
        <div className="mt-2 pt-2 border-t border-cyan-900/20 flex items-center gap-2">
          <span className="text-[10px] text-slate-500">Privacy Pool contract:</span>
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${POOL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-cyan-500 hover:text-cyan-300 font-mono transition-colors"
          >
            {shortenAddress(POOL)} ↗
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Chain({
  steps,
  color,
}: {
  steps: { label: string; addr: string; highlight?: boolean; private?: boolean }[];
  color: "red" | "green";
}) {
  return (
    <div className="space-y-1">
      {steps.map((s, i) => (
        <div key={i}>
          <div
            className={`flex items-center justify-between px-2 py-1 rounded ${
              s.highlight
                ? "bg-white/10 font-bold"
                : s.private
                ? "bg-purple-900/30 border border-purple-600/30"
                : "bg-white/5"
            }`}
          >
            <span className={s.highlight ? "text-white" : s.private ? "text-purple-300" : "text-slate-400"}>
              {s.label}
              {s.private && " 🔒"}
            </span>
            <span className="text-slate-600 text-[10px]">{s.addr}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`text-center text-xs ${color === "red" ? "text-red-600" : "text-green-600"}`}>
              ↓
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="space-y-1">
      <div className="w-6 h-6 rounded-full bg-cyan-900/50 text-cyan-400 text-xs font-bold flex items-center justify-center mx-auto">
        {n}
      </div>
      <p className="font-bold text-slate-300">{title}</p>
      <p className="text-slate-600">{desc}</p>
    </div>
  );
}
