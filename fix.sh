#!/usr/bin/env bash
# fix.sh — Recovery script untuk Gold Signal Pro
# Jalankan: sudo bash fix.sh

set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*"; }

APP_DIR="/opt/gold-signal-pro"
API_PORT=5000

echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   Gold Signal Pro — Recovery Script          ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

[ -d "$APP_DIR" ] || { err "App dir $APP_DIR tidak ditemukan. Jalankan install.sh dulu."; exit 1; }
cd "$APP_DIR"

# ── 1. Update kode terbaru dari GitHub ──────────────────────────────────────
log "Pull latest code from GitHub..."
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git pull origin main || warn "git pull gagal — lanjut dengan kode yang ada"

# ── 2. Hapus semua PM2 proses lama yang konflik ──────────────────────────────
log "Bersihkan PM2 proses lama..."
for PROC in gold-api gold-frontend gold-signal-api; do
  pm2 delete "$PROC" 2>/dev/null && warn "Deleted old process: $PROC" || true
done

# ── 3. Cek port 5000 masih dipakai? Kill paksa ──────────────────────────────
PORT_PID=$(lsof -ti:$API_PORT 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  warn "Port $API_PORT masih dipakai PID $PORT_PID — kill..."
  kill -9 "$PORT_PID" 2>/dev/null || true
  sleep 1
fi

# ── 4. Load env ──────────────────────────────────────────────────────────────
if [ -f "$APP_DIR/.env" ]; then
  log "Loading .env..."
  set -a; source "$APP_DIR/.env"; set +a
else
  err ".env tidak ditemukan di $APP_DIR"
  err "Buat dulu: echo 'DATABASE_URL=...' > $APP_DIR/.env"
  exit 1
fi

# ── 5. Install dependencies jika perlu ──────────────────────────────────────
log "Checking dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── 6. Build API ─────────────────────────────────────────────────────────────
log "Building API server..."
cd "$APP_DIR/artifacts/api-server"
node ./build.mjs 2>&1 | tail -5
ok "API built"

# ── 7. Build frontend ────────────────────────────────────────────────────────
log "Building frontend..."
cd "$APP_DIR/artifacts/xauusd-trading"
PORT=5001 BASE_PATH="/" pnpm run build 2>&1 | tail -5
ok "Frontend built: $(ls $APP_DIR/artifacts/xauusd-trading/dist/ | wc -l) files"

# ── 8. Start PM2 ─────────────────────────────────────────────────────────────
log "Starting gold-signal-api..."
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
pm2 save
ok "PM2 started"

# ── 9. Fix nginx ─────────────────────────────────────────────────────────────
log "Fixing nginx..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

cat > "/etc/nginx/sites-available/gold-signal" <<EONGINX
server {
    listen 80 default_server;
    server_name _;

    root ${APP_DIR}/artifacts/xauusd-trading/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EONGINX

# Hapus semua site lain yang konflik di port 80
for f in /etc/nginx/sites-enabled/*; do
  [[ "$f" == */gold-signal ]] && continue
  if grep -q 'listen 80' "$f" 2>/dev/null; then
    warn "Disable conflicting site: $f"
    rm -f "$f"
  fi
done

ln -sf /etc/nginx/sites-available/gold-signal /etc/nginx/sites-enabled/gold-signal
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
ok "nginx OK"

# ── 10. Verifikasi ───────────────────────────────────────────────────────────
echo ""
log "Verifying..."
sleep 3

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(f'  {p[\"name\"]}: {p[\"pm2_env\"][\"status\"]}') for p in procs]" 2>/dev/null || pm2 list --no-color 2>/dev/null | tail -8)
echo "$PM2_STATUS"

API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/healthz 2>/dev/null || echo "FAIL")
if [ "$API_CHECK" = "200" ]; then
  ok "API /api/healthz → 200 ✓"
else
  warn "API /api/healthz → $API_CHECK (cek: pm2 logs gold-signal-api)"
fi

PRICE=$(curl -s http://localhost:5000/api/analysis/market 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('currentPrice','?'))" 2>/dev/null || echo "?")
[ "$PRICE" != "?" ] && ok "XAUUSD price: \$$PRICE" || warn "Market API belum merespons"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Recovery Complete!                         ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Web  : ${BOLD}http://$SERVER_IP${NC}"
echo -e "  API  : ${BOLD}http://$SERVER_IP/api/healthz${NC}"
echo -e "  Logs : ${BOLD}pm2 logs gold-signal-api${NC}"
echo ""
