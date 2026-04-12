# ShieldEx Demo App — Handoff for Person C

This is a Next.js demo app already wired to the middleware. Your job is to:
1. Run it locally to verify it works
2. Deploy to Vercel

---

## What's Already Built

| File | What it does |
|---|---|
| `app/page.tsx` | Main demo page — layout, polling, state |
| `components/PolicyPanel.tsx` | Live policy limits + daily spend bar |
| `components/PaymentFeed.tsx` | Real-time payment log (approved/rejected) |
| `components/DemoControls.tsx` | 4 one-click demo scenarios for judges |
| `components/PrivacyPanel.tsx` | Before/after privacy pool visualization |
| `lib/api.ts` | All middleware API calls in one place |

The app polls the middleware every 2.5 seconds automatically.

---

## Run Locally

### Step 1 — Start the middleware (separate terminal)
```bash
cd middleware
cp .env.example .env       # ask Person A for AGENT_SECRET_KEY
npm install
npm run dev                # runs on http://localhost:3001
```

### Step 2 — Start the demo app
```bash
cd demo-app
cp .env.example .env
npm install
npm run dev                # runs on http://localhost:3000
```

Open http://localhost:3000 — the app connects to the middleware automatically.

---

## Deploy to Vercel

```bash
npm install -g vercel
cd demo-app
vercel
```

Set these environment variables in the Vercel dashboard:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_MIDDLEWARE_URL` | Your deployed middleware URL |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6` |
| `NEXT_PUBLIC_PRIVACY_POOL_ADDRESS` | `CAL6DU3Z5UR7WTDWKTBCT5DQF23CXJTDIN5AY6BQFRER5CFFGT6SDFFF` |

> Note: The middleware also needs to be deployed somewhere publicly accessible (Railway, Render, or Fly.io work well) so the Vercel app can reach it.

---

## Demo Flow for Judges (4 steps)

All triggered by buttons in the UI — no manual setup needed:

| Step | Button | What judges see |
|---|---|---|
| 1 | 🤖 Start Agent | 3 API payments → all green ✅ |
| 2 | 💸 Expensive Call | $100 attempt → blocked 🛑 |
| 3 | 🔗 Unknown Service | Bad recipient → blocked 🛑 |
| 4 | 💀 Simulate Hack | 5 drain attempts → all blocked 🔒 |

---

## Middleware API (already integrated)

```
POST /pay                              ← DemoControls.tsx
GET  /status                           ← PolicyPanel.tsx + page.tsx
GET  /status/balance                   ← PolicyPanel.tsx
GET  /status/history                   ← PaymentFeed.tsx
GET  /health                           ← page.tsx (online check)
```

Full API docs: [`middleware/API.md`](../middleware/API.md)

---

## If You Want to Customize

- **Change demo payment amounts/reasons** → edit `DEMO_PAYMENTS` in `lib/api.ts`
- **Change attack scenarios** → edit `ATTACK_PAYLOADS` in `lib/api.ts`
- **Change polling interval** → change `2500` in `app/page.tsx`
- **Add more UI panels** → add components in `components/` and import in `app/page.tsx`
