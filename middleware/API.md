# ShieldEx Middleware — API Reference

Base URL: `http://localhost:3000`

---

## POST /pay

Submit a payment request. The middleware validates against the active spending policy, then calls the Soroban Agent Policy Wallet contract.

**Request**
```json
{
  "amount": 0.25,
  "recipient": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "reason": "weather API call"
}
```

| Field | Type | Description |
|---|---|---|
| `amount` | number | Payment amount in USDC (e.g. `0.25`) |
| `recipient` | string | Destination Stellar G-address |
| `reason` | string | Human-readable description of the payment |

**Response — Approved**
```json
{
  "status": "approved",
  "tx_hash": "a1b2c3d4...",
  "nullifier_hash": "0xdeadbeef...",
  "daily_spent": 0.25,
  "daily_remaining": 4.75,
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

**Response — Rejected**
```json
{
  "status": "rejected",
  "rejection_code": "DAILY_CAP_EXCEEDED",
  "reason": "Payment of 1.00 USDC would push daily spend to 6.00, exceeding the cap of 5.00 USDC.",
  "daily_spent": 5.00,
  "daily_remaining": 0.00,
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

**Rejection Codes**

| Code | Meaning | Contract equivalent |
|---|---|---|
| `MAX_TX_EXCEEDED` | Amount exceeds per-transaction limit | `ExceedsMaxPerTx` |
| `DAILY_CAP_EXCEEDED` | Would exceed today's budget | `ExceedsDailyCap` |
| `DISALLOWED_RECIPIENT` | Recipient not in allowed list | `RecipientNotAllowed` |
| `INVALID_AMOUNT` | Amount is zero or negative | *(middleware-level)* |
| `CONTRACT_ERROR` | Network or runtime error | *(middleware-level)* |

> All responses are HTTP 200. HTTP 400 is returned only for malformed requests (missing fields).

---

## GET /status

Returns the active spending policy and today's spend summary.  
Poll this endpoint to drive the live dashboard UI.

**Response**
```json
{
  "ok": true,
  "policy_source": "contract",
  "policy": {
    "max_per_tx": 0.50,
    "daily_cap": 5.00,
    "allowed_destinations": ["G...", "G...", "G..."],
    "currency": "USDC"
  },
  "today": {
    "date": "2026-04-12",
    "spent": 0.75,
    "remaining": 4.25,
    "cap": 5.00
  }
}
```

| Field | Description |
|---|---|
| `policy_source` | `"contract"` if loaded from Soroban, `"config"` if using local fallback |
| `today.spent` | USDC spent so far today (UTC) |
| `today.remaining` | USDC remaining in today's budget |

---

## GET /status/balance

Reads the contract's live USDC balance and on-chain daily spend directly from the Soroban contract (`get_balance()` and `get_daily_spent()`).

**Response**
```json
{
  "ok": true,
  "contract_balance_usdc": 12.50,
  "contract_daily_spent_usdc": 0.75
}
```

---

## GET /status/history

Returns the full spend log (approved + rejected).  
Add `?filter=rejected` to return only policy breach records — used by the hack simulation panel.

**Request**
```
GET /status/history
GET /status/history?filter=rejected
```

**Response**
```json
{
  "ok": true,
  "filter": "rejected",
  "count": 2,
  "records": [
    {
      "id": "uuid-here",
      "timestamp": "2026-04-12T10:01:00.000Z",
      "amount": 10000,
      "recipient": "GUNKNOWNADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "reason": "drain wallet",
      "status": "rejected",
      "rejection_code": "MAX_TX_EXCEEDED",
      "daily_spent_after": 0.75
    }
  ]
}
```

---

## GET /health

Simple health check.

**Response**
```json
{
  "ok": true,
  "service": "shieldex-middleware",
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Running Locally

```bash
cd middleware
cp .env.example .env       # fill in AGENT_SECRET_KEY and CONTRACT_ADDRESS
npm install
npm run dev                # starts on http://localhost:3000
```

## Quick Test

```bash
# Normal payment (should approve)
curl -X POST http://localhost:3000/pay \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.25, "recipient": "G...", "reason": "weather API"}'

# Hack simulation (should reject — MAX_TX_EXCEEDED)
curl -X POST http://localhost:3000/pay \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000, "recipient": "GUNKNOWN...", "reason": "drain wallet"}'

# View today's status
curl http://localhost:3000/status

# View all policy breaches
curl http://localhost:3000/status/history?filter=rejected
```
