#!/bin/bash
# ============================================================
# GOLD SIGNAL PRO — Full Auto Installer untuk VPS Ubuntu
# Jalankan: bash install.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

clear
echo -e "${YELLOW}"
cat << 'EOF'
  ██████╗  ██████╗ ██╗     ██████╗     ███████╗██╗ ██████╗ ███╗   ██╗ █████╗ ██╗
 ██╔════╝ ██╔═══██╗██║     ██╔══██╗    ██╔════╝██║██╔════╝ ████╗  ██║██╔══██╗██║
 ██║  ███╗██║   ██║██║     ██║  ██║    ███████╗██║██║  ███╗██╔██╗ ██║███████║██║
 ██║   ██║██║   ██║██║     ██║  ██║    ╚════██║██║██║   ██║██║╚██╗██║██╔══██║██║
 ╚██████╔╝╚██████╔╝███████╗██████╔╝    ███████║██║╚██████╔╝██║ ╚████║██║  ██║███████╗
  ╚═════╝  ╚═════╝ ╚══════╝╚═════╝     ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
EOF
echo -e "${NC}"
echo -e "${BOLD}  XAUUSD Trading Signal — Auto Installer VPS${NC}"
echo ""

# ─── Deteksi IP VPS ─────────────────────────────────────────
VPS_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null \
      || curl -s --max-time 5 api.ipify.org 2>/dev/null \
      || curl -s --max-time 5 icanhazip.com 2>/dev/null \
      || hostname -I | awk '{print $1}')

if [ -z "$VPS_IP" ]; then
    warn "Tidak bisa mendeteksi IP publik, menggunakan IP lokal"
    VPS_IP=$(hostname -I | awk '{print $1}')
fi

log "IP VPS terdeteksi: ${BOLD}$VPS_IP${NC}"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_USER="goldsignal"
DB_PASS="GoldSignal$(openssl rand -hex 6)!"
DB_NAME="goldsignal"
API_PORT="5000"
FRONTEND_PORT="3000"

step "1/7 — Update sistem & install dependencies"

apt-get update -qq
apt-get install -y -qq curl wget git build-essential nginx postgresql postgresql-contrib openssl 2>/dev/null
log "Sistem dependencies OK"

# Install Node.js 20 jika belum ada
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs 2>/dev/null
fi
log "Node.js $(node -v) OK"

# Install pnpm jika belum ada
if ! command -v pnpm &>/dev/null; then
    info "Installing pnpm..."
    npm install -g pnpm 2>/dev/null
fi
log "pnpm $(pnpm -v) OK"

# Install PM2 jika belum ada
if ! command -v pm2 &>/dev/null; then
    info "Installing PM2..."
    npm install -g pm2 2>/dev/null
fi
log "PM2 OK"

# Install serve untuk static files
npm install -g serve 2>/dev/null
log "serve OK"

step "2/7 — Setup PostgreSQL"

# Start PostgreSQL
systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true
systemctl enable postgresql 2>/dev/null || true

# Buat user dan database
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
log "PostgreSQL database '$DB_NAME' siap"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

step "3/7 — Reset & update kode dari GitHub"

cd "$APP_DIR"
git fetch origin main 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true
log "Kode di-reset ke versi terbaru dari GitHub"

step "4/7 — Buat file .env & install packages"

SESSION_SECRET=$(openssl rand -hex 32)

cat > "$APP_DIR/.env" << ENVEOF
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
API_PORT=${API_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
NODE_ENV=production
ENVEOF

log "File .env dibuat"

export DATABASE_URL="$DATABASE_URL"
export SESSION_SECRET="$SESSION_SECRET"
export NODE_ENV="production"

info "Installing npm packages..."
pnpm install --frozen-lockfile 2>/dev/null
log "Packages OK"

step "5/7 — Push DB schema & build"

info "Pushing database schema..."
pnpm --filter @workspace/db run push
log "Database schema OK"

info "Building API server..."
pnpm --filter @workspace/api-server run build
log "API server build OK"

info "Building frontend..."
BASE_PATH="/" PORT="$FRONTEND_PORT" pnpm --filter @workspace/xauusd-trading run build
log "Frontend build OK"

step "6/7 — Setup Nginx"

# Hapus config nginx lama jika ada
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/goldsignal
rm -f /etc/nginx/sites-available/goldsignal

cat > /etc/nginx/sites-available/goldsignal << NGINXEOF
server {
    listen 80;
    server_name $VPS_IP _;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Frontend static files
    location / {
        root $APP_DIR/artifacts/xauusd-trading/dist/public;
        index index.html;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy
    location /api {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/goldsignal /etc/nginx/sites-enabled/goldsignal

# Test & reload nginx
nginx -t 2>/dev/null
systemctl restart nginx
systemctl enable nginx 2>/dev/null || true
log "Nginx dikonfigurasi & berjalan"

step "7/7 — Start aplikasi dengan PM2"

# Stop proses lama
pm2 delete gold-api 2>/dev/null || true
pm2 delete gold-frontend 2>/dev/null || true

# Jalankan API server
PORT=$API_PORT DATABASE_URL="$DATABASE_URL" SESSION_SECRET="$SESSION_SECRET" NODE_ENV=production \
    pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
    --name "gold-api" \
    --env production

# Tunggu API siap
sleep 2

# Jalankan frontend (serve static)
pm2 start serve \
    --name "gold-frontend" \
    -- -s "$APP_DIR/artifacts/xauusd-trading/dist/public" -l $FRONTEND_PORT

pm2 save --force 2>/dev/null
pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true

# ─── Simpan info deployment ──────────────────────────────────
cat > "$APP_DIR/deployment-info.txt" << INFOEOF
GOLD SIGNAL PRO — Deployment Info
===================================
Tanggal  : $(date)
IP VPS   : $VPS_IP
Website  : http://$VPS_IP
API      : http://$VPS_IP/api/healthz

Database : $DATABASE_URL
INFOEOF

# ─── Final output ────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   INSTALASI SELESAI!"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"
echo -e "  ${BOLD}Website:${NC}  ${CYAN}http://$VPS_IP${NC}"
echo -e "  ${BOLD}API:${NC}      ${CYAN}http://$VPS_IP/api/healthz${NC}"
echo ""
echo -e "  ${BOLD}PM2 Commands:${NC}"
echo "    pm2 list           — lihat status proses"
echo "    pm2 logs gold-api  — lihat log API"
echo "    pm2 restart all    — restart semua"
echo ""
echo -e "  Info tersimpan di: ${YELLOW}$APP_DIR/deployment-info.txt${NC}"
echo ""
pm2 list
