#!/bin/bash
# ============================================================
# GOLD SIGNAL PRO — VPS Startup Script
# Jalankan sekali: bash start-vps.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ██████╗  ██████╗ ██╗     ██████╗     ███████╗██╗ ██████╗ ███╗   ██╗ █████╗ ██╗"
echo "  ██╔════╝ ██╔═══██╗██║     ██╔══██╗    ██╔════╝██║██╔════╝ ████╗  ██║██╔══██╗██║"
echo "  ██║  ███╗██║   ██║██║     ██║  ██║    ███████╗██║██║  ███╗██╔██╗ ██║███████║██║"
echo "  ██║   ██║██║   ██║██║     ██║  ██║    ╚════██║██║██║   ██║██║╚██╗██║██╔══██║██║"
echo "  ╚██████╔╝╚██████╔╝███████╗██████╔╝    ███████║██║╚██████╔╝██║ ╚████║██║  ██║███████╗"
echo "   ╚═════╝  ╚═════╝ ╚══════╝╚═════╝     ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝"
echo -e "${NC}"
echo -e "${YELLOW}  XAUUSD Trading Signal — VPS Setup${NC}"
echo ""

# ─── Cek .env ───────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: File .env tidak ditemukan!${NC}"
    echo ""
    echo "Buat file .env terlebih dahulu:"
    echo "  cp .env.example .env"
    echo "  nano .env   # isi DATABASE_URL dan SESSION_SECRET"
    exit 1
fi

# Load .env
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# ─── Validasi DATABASE_URL ──────────────────────────────────
if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "postgresql://postgres:PASSWORD@localhost:5432/goldsignal" ]; then
    echo -e "${RED}ERROR: DATABASE_URL belum diisi di file .env!${NC}"
    echo ""
    echo "Install PostgreSQL dulu jika belum ada:"
    echo "  apt install postgresql -y"
    echo "  sudo -u postgres psql -c \"CREATE USER goldsignal WITH PASSWORD 'password123';\""
    echo "  sudo -u postgres psql -c \"CREATE DATABASE goldsignal OWNER goldsignal;\""
    echo ""
    echo "Lalu set di .env:"
    echo "  DATABASE_URL=postgresql://goldsignal:password123@localhost:5432/goldsignal"
    exit 1
fi

echo -e "${GREEN}[1/4] Environment OK${NC}"

# ─── Install dependencies ────────────────────────────────────
echo -e "${YELLOW}[2/4] Installing dependencies...${NC}"
pnpm install --frozen-lockfile

echo -e "${GREEN}[2/4] Dependencies OK${NC}"

# ─── Push DB schema ──────────────────────────────────────────
echo -e "${YELLOW}[3/4] Pushing database schema...${NC}"
pnpm --filter @workspace/db run push

echo -e "${GREEN}[3/4] Database schema OK${NC}"

# ─── Build frontend ──────────────────────────────────────────
echo -e "${YELLOW}[4/4] Building frontend...${NC}"
BASE_PATH="/" PORT="${FRONTEND_PORT:-3000}" pnpm --filter @workspace/xauusd-trading run build

echo -e "${GREEN}[4/4] Frontend built OK${NC}"

# ─── Build API server ────────────────────────────────────────
echo -e "${YELLOW}Building API server...${NC}"
pnpm --filter @workspace/api-server run build

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  BUILD SUKSES! Siap dijalankan.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Untuk menjalankan:"
echo ""
echo -e "  ${YELLOW}API Server (port ${API_PORT:-5000}):${NC}"
echo "    PORT=${API_PORT:-5000} node artifacts/api-server/dist/index.mjs"
echo ""
echo -e "  ${YELLOW}Frontend (port ${FRONTEND_PORT:-3000}):${NC}"
echo "    BASE_PATH=/ PORT=${FRONTEND_PORT:-3000} pnpm --filter @workspace/xauusd-trading run preview"
echo ""
echo -e "  ${YELLOW}Atau pakai PM2 (recommended):${NC}"
echo "    bash run-pm2.sh"
echo ""
