// ============================================================
// index.ts — Express server entry point
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { checkStellarConnection } from "./stellar";
import payRouter from "./routes/pay";
import statusRouter from "./routes/status";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}  [${new Date().toISOString()}]`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use("/pay", payRouter);
app.use("/status", statusRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "shieldex-middleware",
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log(  "║       ShieldEx Agent Middleware          ║");
  console.log(  "╚══════════════════════════════════════════╝\n");

  await checkStellarConnection();

  app.listen(PORT, () => {
    console.log(`\n🚀  http://localhost:${PORT}`);
    console.log(`    POST /pay                — Submit a payment`);
    console.log(`    GET  /status             — Active policy + today's spend`);
    console.log(`    GET  /status/balance     — Live on-chain contract balance`);
    console.log(`    GET  /status/history     — Full spend log`);
    console.log(`    GET  /status/history?filter=rejected  — Policy breaches only`);
    console.log(`    GET  /health             — Health check\n`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
