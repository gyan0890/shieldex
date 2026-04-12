// ── Middleware API client ──────────────────────────────────────
// All calls go through the ShieldEx middleware at MIDDLEWARE_URL.

const MIDDLEWARE = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? "http://localhost:3001";

export interface PayRequest {
  amount: number;
  recipient: string;
  reason: string;
}

export interface PayResponse {
  status: "approved" | "rejected";
  tx_hash?: string;
  nullifier_hash?: string;
  daily_spent?: number;
  daily_remaining?: number;
  rejection_code?: string;
  reason?: string;
  timestamp: string;
}

export interface PolicyStatus {
  ok: boolean;
  policy_source: "contract" | "config";
  policy: {
    max_per_tx: number;
    daily_cap: number;
    allowed_destinations: string[];
    currency: string;
  };
  today: {
    date: string;
    spent: number;
    remaining: number;
    cap: number;
  };
}

export interface BalanceStatus {
  ok: boolean;
  contract_balance_usdc: number;
  contract_daily_spent_usdc: number;
}

export interface SpendRecord {
  id: string;
  timestamp: string;
  amount: number;
  recipient: string;
  reason: string;
  status: "approved" | "rejected";
  tx_hash?: string;
  nullifier_hash?: string;
  rejection_code?: string;
  daily_spent_after?: number;
}

export async function pay(req: PayRequest): Promise<PayResponse> {
  const res = await fetch(`${MIDDLEWARE}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Middleware error: ${res.status}`);
  return res.json();
}

export async function getStatus(): Promise<PolicyStatus> {
  const res = await fetch(`${MIDDLEWARE}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Status error: ${res.status}`);
  return res.json();
}

export async function getBalance(): Promise<BalanceStatus> {
  const res = await fetch(`${MIDDLEWARE}/status/balance`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Balance error: ${res.status}`);
  return res.json();
}

export async function getHistory(filter?: "rejected"): Promise<{ records: SpendRecord[] }> {
  const url = filter
    ? `${MIDDLEWARE}/status/history?filter=${filter}`
    : `${MIDDLEWARE}/status/history`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`History error: ${res.status}`);
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${MIDDLEWARE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Demo scenario helpers ──────────────────────────────────────

/** Normal API payments the agent would make autonomously */
export const DEMO_PAYMENTS = [
  { amount: 0.10, reason: "Weather API — current conditions" },
  { amount: 0.25, reason: "Flight data API — search results" },
  { amount: 0.15, reason: "News API — top headlines" },
];

/** Attack payloads for the hack simulation */
export const ATTACK_PAYLOADS = [
  { amount: 10_000, reason: "drain wallet", label: "Drain entire wallet" },
  { amount: 0.10,   reason: "exfiltrate to attacker",  label: "Exfiltrate to unknown address" },
  { amount: 999,    reason: "max extraction attempt",  label: "Max extraction" },
  { amount: 50,     reason: "exceeds daily cap",       label: "Exceed daily cap" },
  { amount: 0.10,   reason: "repeated small drain",    label: "Repeated small drain" },
];

export const ATTACKER_ADDRESS = "GD7YFAGV2FNC5BWPW64QT7HQSTRUEHMFB7X5RKWTSSUUWMBYW72U7MLU";

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortenHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
