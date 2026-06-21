#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
LOG="$DIR/deploy.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Cubino native deploy started ==="

log "Setting up PostgreSQL..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='cubino'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER cubino WITH PASSWORD 'cubino';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='cubino'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE cubino OWNER cubino;"

log "Starting Redis..."
sudo systemctl enable --now redis-server 2>/dev/null || sudo systemctl enable --now redis 2>/dev/null || true

log "Writing .env..."
if [ ! -f .env ]; then cp .env.example .env; fi
grep -q '^DATABASE_URL=' .env || echo 'DATABASE_URL=postgresql://cubino:cubino@localhost:5432/cubino' >> .env
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://cubino:cubino@localhost:5432/cubino|' .env
grep -q '^REDIS_URL=' .env || echo 'REDIS_URL=redis://localhost:6379' >> .env
sed -i 's|^REDIS_URL=.*|REDIS_URL=redis://localhost:6379|' .env
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://cubino.ir,http://192.168.1.100,http://localhost|' .env
sed -i 's|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=|' .env
sed -i 's|^NEXT_PUBLIC_WS_URL=.*|NEXT_PUBLIC_WS_URL=|' .env
sed -i 's|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://cubino.ir|' .env

log "Enabling pnpm..."
echo '8585' | sudo -S corepack enable
echo '8585' | sudo -S corepack prepare pnpm@9.15.0 --activate

log "Installing dependencies (this takes 5-15 min on Pi)..."
pnpm install 2>&1 | tee -a "$LOG"

log "Building apps (Next.js build takes 5-10 min on Pi)..."
pnpm build 2>&1 | tee -a "$LOG"

log "Running migrations..."
pnpm db:migrate 2>&1 | tee -a "$LOG"
pnpm db:seed 2>&1 | tee -a "$LOG" || true

log "Starting PM2..."
pm2 delete cubino-server cubino-web 2>/dev/null || true
cd "$DIR/apps/server" && pm2 start dist/index.js --name cubino-server
cd "$DIR/apps/web" && pm2 start "pnpm start" --name cubino-web
pm2 save

log "=== Deploy complete ==="
curl -s -o /dev/null -w "web:%{http_code} api:" http://127.0.0.1:3000/ || true
curl -s http://127.0.0.1:3001/health || true
