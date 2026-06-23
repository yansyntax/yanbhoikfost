#!/bin/bash
# ============================================================
# GOLD SIGNAL PRO — Jalankan dengan PM2 (recommended untuk VPS)
# Install PM2 dulu: npm install -g pm2
# Lalu jalankan: bash run-pm2.sh
# ============================================================

set -e

# Load .env
if [ ! -f ".env" ]; then
    echo "ERROR: File .env tidak ditemukan. Jalankan dulu: bash start-vps.sh"
    exit 1
fi
export $(grep -v '^#' .env | grep -v '^$' | xargs)

API_PORT="${API_PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "Starting GOLD SIGNAL PRO dengan PM2..."
echo ""

# Stop proses lama jika ada
pm2 delete gold-api 2>/dev/null || true
pm2 delete gold-frontend 2>/dev/null || true

# Jalankan API server
PORT=$API_PORT pm2 start artifacts/api-server/dist/index.mjs \
    --name "gold-api" \
    --env production \
    -- --env DATABASE_URL="$DATABASE_URL" SESSION_SECRET="$SESSION_SECRET"

# Serve frontend static files
BASE_PATH="/" PORT=$FRONTEND_PORT pm2 start \
    "pnpm --filter @workspace/xauusd-trading run preview -- --port $FRONTEND_PORT --host 0.0.0.0" \
    --name "gold-frontend" \
    --interpreter none

pm2 save
pm2 list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GOLD SIGNAL PRO berjalan!"
echo ""
echo "  Frontend : http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):$FRONTEND_PORT"
echo "  API      : http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):$API_PORT/api/healthz"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
