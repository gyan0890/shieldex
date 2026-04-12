#!/usr/bin/env bash
# test-contracts.sh
#
# Smoke-test for both deployed Soroban contracts on Stellar testnet.
#
# Requires:
#   - stellar CLI installed and configured
#   - Named keys "operator" and "agent" in the local stellar keystore
#     (run: stellar keys generate operator --network testnet && stellar keys fund operator --network testnet)
#
# Usage (defaults work out of the box after deployment):
#   ./scripts/test-contracts.sh
#
# Overrides:
#   OPERATOR_KEY=operator AGENT_KEY=agent ./scripts/test-contracts.sh

set -euo pipefail

NETWORK="testnet"

OPERATOR_KEY="${OPERATOR_KEY:-operator}"
AGENT_KEY="${AGENT_KEY:-agent}"
AGENT_WALLET_CONTRACT="${AGENT_WALLET_CONTRACT:-CCRJTH7RJLNTXQYTMNSXZZRVGFDIAXDAOYNVSROPDUJ3BVVATNUSNPE6}"
PRIVACY_POOL_CONTRACT="${PRIVACY_POOL_CONTRACT:-CAL6DU3Z5UR7WTDWKTBCT5DQF23CXJTDIN5AY6BQFRER5CFFGT6SDFFF}"

OPERATOR_PUB=$(stellar keys address "$OPERATOR_KEY")
AGENT_PUB=$(stellar keys address "$AGENT_KEY")

# Placeholder dest — operator addr until Person B confirms real API addresses
DEST_ADDR="${DEST_ADDR:-$OPERATOR_PUB}"
AMOUNT="${TEST_AMOUNT:-1000000}"  # 0.1 XLM in stroops

echo "================================================"
echo " Shieldex Contract Smoke Test"
echo " Network:      $NETWORK"
echo " Operator:     $OPERATOR_PUB"
echo " Agent:        $AGENT_PUB"
echo " Agent Wallet: $AGENT_WALLET_CONTRACT"
echo " Privacy Pool: $PRIVACY_POOL_CONTRACT"
echo "================================================"
echo ""

invoke() {
  stellar contract invoke --network "$NETWORK" "$@"
}

# ---------------------------------------------------------------------------
# 1. Read current policy
# ---------------------------------------------------------------------------
echo "[1] Reading policy..."
invoke --id "$AGENT_WALLET_CONTRACT" --source-account "$OPERATOR_KEY" -- get_policy
echo ""

# ---------------------------------------------------------------------------
# 2. Read current balance
# ---------------------------------------------------------------------------
echo "[2] Agent wallet balance (stroops)..."
invoke --id "$AGENT_WALLET_CONTRACT" --source-account "$OPERATOR_KEY" -- get_balance
echo ""

# ---------------------------------------------------------------------------
# 3. Valid pay() — agent sends to whitelisted destination
# ---------------------------------------------------------------------------
echo "[3] Sending valid pay() of $AMOUNT stroops to $DEST_ADDR..."
NULLIFIER=$(invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_KEY" \
  --send=yes \
  -- pay \
  --amount "$AMOUNT" \
  --recipient "$DEST_ADDR" \
  --memo '"test payment"')
echo "    Spend nullifier: $NULLIFIER"
echo ""

# ---------------------------------------------------------------------------
# 4. Daily spend after payment
# ---------------------------------------------------------------------------
echo "[4] Daily spend after payment (stroops)..."
invoke --id "$AGENT_WALLET_CONTRACT" --source-account "$OPERATOR_KEY" -- get_daily_spent
echo ""

# ---------------------------------------------------------------------------
# 5. Policy breach: amount > max_per_tx (must fail)
# ---------------------------------------------------------------------------
echo "[5] Breach test — amount > max_per_tx (should be rejected)..."
invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_KEY" \
  --send=yes \
  -- pay \
  --amount "100000000000" \
  --recipient "$DEST_ADDR" \
  --memo '"drain attempt"' \
  && echo "FAIL: expected rejection" \
  || echo "PASS: contract rejected oversized payment"
echo ""

# ---------------------------------------------------------------------------
# 6. Policy breach: unlisted recipient (must fail)
# ---------------------------------------------------------------------------
ATTACKER="${ATTACKER_ADDR:-GD7YFAGV2FNC5BWPW64QT7HQSTRUEHMFB7X5RKWTSSUUWMBYW72U7MLU}"
echo "[6] Breach test — unlisted recipient (should be rejected)..."
invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$AGENT_KEY" \
  --send=yes \
  -- pay \
  --amount "$AMOUNT" \
  --recipient "$ATTACKER" \
  --memo '"small drain"' \
  && echo "FAIL: expected rejection" \
  || echo "PASS: contract rejected unlisted recipient"
echo ""

# ---------------------------------------------------------------------------
# 7. Update policy (operator only)
# ---------------------------------------------------------------------------
echo "[7] Updating policy (operator: $OPERATOR_PUB)..."
invoke \
  --id "$AGENT_WALLET_CONTRACT" \
  --source-account "$OPERATOR_KEY" \
  --send=yes \
  -- update_policy \
  --new_max_per_tx "2000000" \
  --new_daily_cap "20000000" \
  --new_allowed_destinations "[\"$DEST_ADDR\"]"
echo "    Policy updated."
echo ""

# ---------------------------------------------------------------------------
# 8. Read updated policy
# ---------------------------------------------------------------------------
echo "[8] Reading updated policy..."
invoke --id "$AGENT_WALLET_CONTRACT" --source-account "$OPERATOR_KEY" -- get_policy
echo ""

# ---------------------------------------------------------------------------
# 9. Privacy pool — check nullifiers
# ---------------------------------------------------------------------------
echo "[9] Privacy pool nullifiers (spent commitments)..."
invoke --id "$PRIVACY_POOL_CONTRACT" --source-account "$OPERATOR_KEY" -- get_nullifiers
echo ""

echo "================================================"
echo " Smoke test complete."
echo "================================================"
