#!/bin/bash
# Script untuk push kode ke GitHub
# Jalankan: bash push-to-github.sh

set -e

REPO_URL="https://github.com/yansyntax/yanbhoikfost.git"

echo "=== GOLD SIGNAL PRO - Push ke GitHub ==="
echo ""

# Minta token jika belum ada di environment
if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo "Masukkan GitHub Personal Access Token Anda:"
    read -s GITHUB_PERSONAL_ACCESS_TOKEN
fi

# Set remote dengan token
REMOTE_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/yansyntax/yanbhoikfost.git"

# Cek apakah remote 'github' sudah ada
if git remote get-url github &>/dev/null 2>&1; then
    git remote set-url github "$REMOTE_URL"
else
    git remote add github "$REMOTE_URL"
fi

echo "Pushing ke $REPO_URL ..."
git push github main --force

echo ""
echo "Sukses! Kode sudah di-push ke GitHub."
echo "Cek di: $REPO_URL"
