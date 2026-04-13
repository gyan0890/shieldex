"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const HOW_IT_WORKS = [
  {
    icon: "🤖",
    title: "AI Plans Your Trip",
    desc: "Claude autonomously calls 7 travel APIs — flights, hotels, weather, activities, restaurants, visas, budget — to build a complete itinerary.",
  },
  {
    icon: "⛓",
    title: "Soroban Enforces Policy",
    desc: "Every API call triggers a real USDC micropayment gated by your on-chain spending policy: max per tx, daily cap, and whitelisted destinations.",
  },
  {
    icon: "🔒",
    title: "ZK Privacy Pool",
    desc: "Payments are anonymised through the ShieldEx Privacy Pool contract. Nullifier hashes published on-chain — your identity is never revealed.",
  },
];

export default function Home() {
  const router = useRouter();

  const [form, setForm] = useState({
    from: "",
    to: "",
    startDate: "",
    endDate: "",
    budget: "",
    travelers: "2",
    interests: "",
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      from: form.from || "New York",
      to: form.to || "Tokyo",
      startDate: form.startDate || "2026-06-01",
      endDate: form.endDate || "2026-06-10",
      budget: form.budget || "3000",
      travelers: form.travelers || "2",
      interests: form.interests || "culture, food, adventure",
    });
    router.push(`/plan?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#070c14] text-white overflow-x-hidden">

      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/80 flex items-center justify-center text-base shadow-lg shadow-indigo-500/30">
            🛡️
          </div>
          <span className="text-lg font-bold tracking-tight">ShieldEx</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#how" className="hover:text-white transition-colors">How It Works</a>
          <a href="#plan" className="hover:text-white transition-colors">Plan Trip</a>
        </div>

        <button
          onClick={() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" })}
          className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all"
        >
          Start Planning
        </button>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative h-screen flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1920&q=80"
            alt="Kyoto Japan street"
            className="w-full h-full object-cover"
            style={{ objectPosition: "center 35%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-[#070c14]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <div
            className="rounded-3xl px-12 py-10"
            style={{
              background: "rgba(7,12,20,0.55)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Live on Stellar Testnet · Real USDC payments
            </div>

            <h1 className="text-5xl font-bold leading-[1.1] mb-5">
              Plan Your Dream Trip<br />with AI in Seconds
            </h1>
            <p className="text-lg text-white/60 mb-8 max-w-xl mx-auto">
              An autonomous AI agent plans your trip and pays for every API call
              via Soroban smart contract — policy-enforced, privacy-preserving.
            </p>
            <button
              onClick={() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-all text-base"
            >
              Start Planning <span>↗</span>
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/30 text-xs animate-bounce">
          <span>↓</span>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section id="how" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-indigo-400 text-sm font-medium tracking-widest uppercase mb-3">How It Works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              AI agent + blockchain policy
            </h2>
            <p className="text-white/50 mt-3 max-w-xl mx-auto text-base">
              Every step is verifiable on-chain. No hidden fees, no identity leaks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item, i) => (
              <div
                key={i}
                className="rounded-2xl p-7 border border-slate-800 bg-[#0d1220]"
                style={{ boxShadow: "0 2px 24px rgba(0,0,0,0.3)" }}
              >
                <div className="text-3xl mb-4">{item.icon}</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-indigo-500 opacity-60">0{i + 1}</span>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Contract info bar */}
          <div className="mt-8 rounded-xl border border-slate-800 bg-[#0d1220] px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">●</span>
              <span>Contract live on Stellar Testnet</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-600">Agent Wallet:</span>
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6").slice(0, 12)}…
              </a>
            </div>
            <div className="flex items-center gap-4">
              <span><span className="text-white">0.2 USDC</span> max/tx</span>
              <span><span className="text-white">2 USDC</span> daily cap</span>
              <span><span className="text-white">99.9 USDC</span> wallet balance</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLAN FORM ────────────────────────────────────────── */}
      <section id="plan" className="py-16 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-indigo-400 text-sm font-medium tracking-widest uppercase mb-3">Plan Your Trip</p>
            <h2 className="text-3xl md:text-4xl font-bold">Where are you going?</h2>
            <p className="text-white/50 mt-3 text-base">
              The AI agent will research and pay for every data source on-chain.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-[#0d1220] p-8 space-y-5"
            style={{ boxShadow: "0 4px 40px rgba(0,0,0,0.4)" }}
          >
            {/* Origin / Destination */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">From</label>
                <input
                  type="text"
                  placeholder="e.g. New York"
                  value={form.from}
                  onChange={set("from")}
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">To</label>
                <input
                  type="text"
                  placeholder="e.g. Tokyo"
                  value={form.to}
                  onChange={set("to")}
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Departure</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={set("startDate")}
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Return</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={set("endDate")}
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Budget / Travelers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Budget (USD)</label>
                <input
                  type="number"
                  placeholder="$3,000"
                  value={form.budget}
                  onChange={set("budget")}
                  min="100"
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Travelers</label>
                <select
                  value={form.travelers}
                  onChange={set("travelers")}
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-colors"
                >
                  {[1,2,3,4,5,6,7,8].map((n) => (
                    <option key={n} value={String(n)}>{n} traveler{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">
                Interests <span className="text-slate-600 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="food, art, hiking, nightlife, temples…"
                value={form.interests}
                onChange={set("interests")}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-white text-black font-bold text-base hover:bg-white/90 active:scale-[0.99] transition-all"
            >
              ⚡ Plan My Trip with AI
            </button>

            <p className="text-center text-xs text-slate-600">
              🔒 All agent payments are anonymised via the ShieldEx Privacy Pool on Stellar — nullifier hashes published on-chain
            </p>
          </form>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <span className="font-semibold text-slate-400">ShieldEx</span>
            <span>— AI Travel Agent with On-Chain Spending Policies</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/gyan0890/shieldex"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-400 transition-colors"
            >
              GitHub
            </a>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-400 transition-colors"
            >
              Stellar Explorer
            </a>
            <span>DoraHacks 2026</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
