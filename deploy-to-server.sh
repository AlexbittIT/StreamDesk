#!/usr/bin/env bash
# Выполняется на сервере после загрузки файлов (npm run deploy).
# Устанавливает зависимости, применяет миграции, собирает и перезапускает приложение.

set -e
cd "$(dirname "$0")"

echo "[deploy] npm install..."
npm install --production=false

if [ ! -f .env ] || ! grep -q "DATABASE_URL" .env 2>/dev/null; then
  echo "[deploy] ERROR: .env with DATABASE_URL not found. Tables will not be created."
  echo "[deploy] Run full deploy (deploy-server.bat) so setup creates .env on server."
  exit 1
fi
echo "[deploy] db:push (create/update tables)..."
npm run db:push
if [ $? -ne 0 ]; then
  echo "[deploy] ERROR: db:push failed. Fix DATABASE_URL in .env on server and run again."
  exit 1
fi

echo "[deploy] build..."
npm run build

echo "[deploy] pm2..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe streamdesk >/dev/null 2>&1; then
    pm2 restart streamdesk
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save 2>/dev/null || true
else
  echo "[deploy] PM2 не установлен. Запустите: npm install -g pm2 && pm2 start ecosystem.config.cjs"
fi

echo "[deploy] готово."
