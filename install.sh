#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║         GOLD Signal Pro — VPS Installer                             ║
# ║         XAUUSD SMC Trading Signal System                            ║
# ║         Installs: Node.js 22, pnpm, PostgreSQL, nginx, PM2          ║
# ╚══════════════════════════════════════════════════════════════════════╝

set -euo pipefail

REPO_URL="https://github.com/yansyntax/yanbhoikfost"
APP_DIR="/opt/gold-signal-pro"
SERVICE_USER="goldapp"
API_PORT="5000"
FRONTEND_PORT="5001"

# ── Colors ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

# ── Root check ──────────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || err "Run as root: sudo bash $0"

echo -e ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       GOLD Signal Pro — VPS Installer       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo -e ""

# ── System packages ──────────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl git wget gnupg lsb-release ca-certificates postgresql postgresql-contrib nginx

# ── Node.js 22 ──────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  log "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
ok "Node.js $(node -v)"

# ── pnpm ────────────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm..."
  npm install -g pnpm@latest -q
fi
ok "pnpm $(pnpm -v)"

# ── PM2 ─────────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  npm install -g pm2@latest -q
fi
ok "PM2 installed"

# ── PostgreSQL setup ─────────────────────────────────────────────────────────────
log "Configuring PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql -q

DB_NAME="goldsignal"
DB_USER="goldsignal"
DB_PASS="$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)"

# Create DB and user if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';" 2>/dev/null || true

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
ok "PostgreSQL configured"

# ── App user ────────────────────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
  log "Creating service user $SERVICE_USER..."
  useradd -r -s /bin/bash -d "$APP_DIR" "$SERVICE_USER"
fi

# ── Clone / update repo ─────────────────────────────────────────────────────────
# Fix git safe.directory for root installs
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo..."
  cd "$APP_DIR"
  git pull origin main
else
  log "Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# ── pnpm install ─────────────────────────────────────────────────────────────────
log "Installing dependencies..."
cd "$APP_DIR"
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── Environment file ────────────────────────────────────────────────────────────
log "Creating .env file..."
SESSION_SECRET="$(openssl rand -base64 48)"
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
EOF

# ── DB schema push ──────────────────────────────────────────────────────────────
log "Pushing database schema..."
cd "$APP_DIR"
export DATABASE_URL="$DATABASE_URL"
pnpm --filter @workspace/db run push --accept-data-loss 2>&1 | tail -5 || warn "DB push failed — may already be up to date"

# ── Build API server ─────────────────────────────────────────────────────────────
log "Building API server..."
cd "$APP_DIR/artifacts/api-server"
node ./build.mjs || pnpm run build

# ── Build frontend ──────────────────────────────────────────────────────────────
log "Building frontend..."
cd "$APP_DIR/artifacts/xauusd-trading"
PORT=$FRONTEND_PORT BASE_PATH="/" pnpm run build

# ── PM2 processes ────────────────────────────────────────────────────────────────
log "Setting up PM2 processes..."

# Generate PM2 ecosystem file
cat > "$APP_DIR/ecosystem.config.cjs" <<EOFPM2
module.exports = {
  apps: [
    {
      name: 'gold-signal-api',
      script: './artifacts/api-server/dist/index.mjs',
      cwd: '${APP_DIR}',
      env: {
        NODE_ENV: 'production',
        PORT: '${API_PORT}',
        DATABASE_URL: '${DATABASE_URL}',
        SESSION_SECRET: '${SESSION_SECRET}',
      },
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
EOFPM2

cd "$APP_DIR"
# Remove any old conflicting PM2 processes (previous installs)
for OLD_PROC in gold-api gold-frontend gold-signal-api; do
  pm2 delete "$OLD_PROC" 2>/dev/null || true
done
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true

# ── nginx config ─────────────────────────────────────────────────────────────────
log "Configuring nginx..."

# Detect server IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

# Backup existing nginx default config if present
if [ -f /etc/nginx/sites-available/default ]; then
  cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak."$(date +%s)" 2>/dev/null || true
fi

cat > "/etc/nginx/sites-available/gold-signal" <<EONGINX
server {
    listen 80 default_server;
    server_name ${SERVER_IP} _;

    # Frontend (static)
    root ${APP_DIR}/artifacts/xauusd-trading/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
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

ln -sf /etc/nginx/sites-available/gold-signal /etc/nginx/sites-enabled/gold-signal
# Disable default & any old site configs that would conflict on port 80
rm -f /etc/nginx/sites-enabled/default
# Remove any other enabled sites that also listen on port 80 (to avoid conflict)
for f in /etc/nginx/sites-enabled/*; do
  [[ "$f" == */gold-signal ]] && continue
  if grep -q 'listen 80' "$f" 2>/dev/null; then
    warn "Disabling conflicting nginx site: $f"
    rm -f "$f"
  fi
done
nginx -t && systemctl reload nginx
ok "nginx configured"

# ── Summary ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║     Installation Complete! ✓                ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  App URL  : ${BOLD}http://$SERVER_IP${NC}"
echo -e "  API URL  : ${BOLD}http://$SERVER_IP/api/healthz${NC}"
echo -e "  PM2 logs : ${BOLD}pm2 logs gold-signal-api${NC}"
echo ""
echo -e "${YELLOW}  Save DB password (jangan hilangkan):${NC}"
echo -e "  DB_PASS  = $DB_PASS"
echo ""
