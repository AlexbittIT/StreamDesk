#!/bin/bash

# Скрипт автоматического деплоя на Ubuntu сервер
# Использование: ./deploy-to-server.sh

set -e

echo "========================================"
echo "  🚀 Деплой StreamDesk на сервер"
echo "========================================"
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка наличия необходимых команд
command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ Git не установлен${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm не установлен${NC}"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo -e "${RED}❌ PM2 не установлен. Установите: npm install -g pm2${NC}"; exit 1; }

# Переходим в директорию проекта
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo -e "${YELLOW}📂 Директория проекта: $PROJECT_DIR${NC}"
echo ""

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo -e "${RED}❌ Файл .env не найден!${NC}"
    echo "Создайте файл .env с настройками базы данных"
    exit 1
fi

# Если используется Git, получаем последние изменения
if [ -d .git ]; then
    echo -e "${YELLOW}📥 Получение последних изменений из Git...${NC}"
    git pull origin main || git pull origin master || echo "⚠️  Не удалось получить изменения из Git"
    echo ""
fi

# Установка зависимостей сервера
echo -e "${YELLOW}📦 Установка зависимостей сервера...${NC}"
npm install --production
echo ""

# Установка зависимостей клиента и сборка
if [ -d "client" ]; then
    echo -e "${YELLOW}📦 Установка зависимостей клиента...${NC}"
    cd client
    npm install
    
    echo -e "${YELLOW}🔨 Сборка клиента...${NC}"
    npm run build
    cd ..
    echo ""
fi

# Проверка наличия PM2 процесса
if pm2 list | grep -q "streamdesk"; then
    echo -e "${YELLOW}🔄 Перезапуск приложения через PM2...${NC}"
    pm2 restart streamdesk
else
    echo -e "${YELLOW}🚀 Запуск приложения через PM2...${NC}"
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
    else
        pm2 start server/index.ts --name streamdesk --interpreter npx --interpreter-args "tsx"
    fi
    pm2 save
fi

echo ""
echo -e "${GREEN}✅ Деплой завершен успешно!${NC}"
echo ""
echo "Проверьте статус приложения:"
echo "  pm2 status"
echo "  pm2 logs streamdesk"
echo ""