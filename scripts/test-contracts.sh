#!/usr/bin/env bash
# test-contracts.sh
#
# Quick smoke-test for both deployed Soroban contracts on Stellar testnet.
# Run after deployment: ./scripts/test-contracts.sh
#
# Requires:
#   - stellar CLI (https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
#   - Two funded testnet accounts: OPERATOR (owner) and AGENT
#   - AGENT_WALLET_CONTRACT and PRIVACY_POOL_CONTRACT set in the env or below
#
# Usage:
#   export OPERATOR_SECRET=S...
#   export AGENT_SECRET=S...
#   export AGENT_WALLET_CONTRACT=C...
#   export PRIVACY_POOL_CONTRACT=C...
#   ./scripts/test-contracts.sh

set -euo pipefail

NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

OPERATOR_SECRET="${OPERATOR_SECRET:?Set OPERATOR_SECRET}"
AGENT_SECRET="${AGENT_SECRET:?Set AGENT_SECRET}"
AGENT_WALLET_CONTRACT="${AGENT_WALLET_CONTRACT:?Set AGENT_WALLET_CONTRACT}"
PRIVACY_POOL_CONTRACT="${PRIVACY_POOL_CONTRACT:?Set PRIVACY_POOL_CONTRACT}"

OPERATOR_PUB=$(stellar keys address --secret-key "$OPERATOR_SECRET" 2>/dev/null || \
  echo "$OPERATOR_SECRET" | stellar keys generate --network testnet --fund - 2>/dev/null)
AGENT_PUB=$(stellar keys address --secret-key "$AGENT_SECRET" 2>/dev/null)

echo "================================================"
echo " Shieldex Contract Smoke Test"
echo " Network:        $NETWORK"
echo " Agent Wallet:   $AGENT_WALLET_CONTRACT"
echo " Privacy Pool:   $PRIVACY_POOL_CONTRACT"
echo "================================================"
echo ""

stellar() {
  command stellar --network "$NETWORK" --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" "$@"
}

# ---------------------------------------------------------------------------
# 1. Read current policy
# ---------------------------------------------------------------------------
echo "[1] Reading policy..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  -- get_policy
echo ""

# ---------------------------------------------------------------------------
# 2. Read current balance
# ---------------------------------------------------------------------------
echo "[2] Agent wallet balance (stroops)..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  -- get_balance
echo ""

# ---------------------------------------------------------------------------
# 3. Attempt a valid pay() — amount must be <= max_per_tx and recipient
#    must be in allowed_destinations. Update DEST_ADDR before running.
# ---------------------------------------------------------------------------
DEST_ADDR="${DEST_ADDR:-GBWEATHERAPI4X402TESTNETADDRESS000000000000000000}"
AMOUNT="${TEST_AMOUNT:-1000000}"  # 0.1 XLM in stroops

echo "[3] Sending valid pay() of $AMOUNT stroops to $DEST_ADDR..."
NULLIFIER=$(stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_SECRET" \
  -- pay \
  --amount "$AMOUNT" \
  --recipient "$DEST_ADDR" \
  --memo '"test payment"')
echo "    Spend nullifier: $NULLIFIER"
echo ""

# ---------------------------------------------------------------------------
# 4. Check daily spend updated
# ---------------------------------------------------------------------------
echo "[4] Daily spend after payment (stroops)..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  -- get_daily_spent
echo ""

# ---------------------------------------------------------------------------
# 5. Attempt policy breach: amount > max_per_tx (expected to fail)
# ---------------------------------------------------------------------------
echo "[5] Policy breach test — amount > max_per_tx (should fail)..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_SECRET" \
  -- pay \
  --amount "100000000000" \
  --recipient "$DEST_ADDR" \
  --memo '"drain attempt"' && echo "FAIL: expected rejection" || echo "PASS: contract rejected oversized payment"
echo ""

# ---------------------------------------------------------------------------
# 6. Attempt policy breach: unlisted recipient (expected to fail)
# ---------------------------------------------------------------------------
ATTACKER="${ATTACKER_ADDR:-GDATTACKERADDRESSTESTNET00000000000000000000000000000}"
echo "[6] Policy breach test — unlisted recipient $ATTACKER (should fail)..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_SECRET" \
  -- pay \
  --amount "$AMOUNT" \
  --recipient "$ATTACKER" \
  --memo '"small drain"' && echo "FAIL: expected rejection" || echo "PASS: contract rejected unlisted recipient"
echo ""

# ---------------------------------------------------------------------------
# 7. Update policy (owner only)
# ---------------------------------------------------------------------------
echo "[7] Updating policy (owner: $OPERATOR_PUB)..."
stellar contract invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$OPERATOR_SECRET" \
  -- update_policy \
  --new_max_per_tx "2000000" \
  --new_daily_cap "20000000" \
  --new_allowed_destinations "[$DEST_ADDR]"
echo "    Policy updated."
echo ""

# ---------------------------------------------------------------------------
# 8. Privacy pool: check nullifiers (post fund_agent_wallet, if run)
# ---------------------------------------------------------------------------
echo "[8] Privacy pool nullifiers (spent commitments)..."
stellar contract invoke \
  --id "$PRIVACY_POOL_CONTRACT" \
  -- get_nullifiers
echo ""

echo "================================================"
echo " Smoke test complete."
echo "================================================"
