#!/bin/bash

# Скрипт автоматического деплоя StreamDesk на Ubuntu
# Использование: sudo bash deploy.sh

set -e

echo "=========================================="
echo "  StreamDesk - Автоматический деплой"
echo "=========================================="
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Пожалуйста, запустите скрипт с правами root (sudo)"
    exit 1
fi

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Шаг 1: Обновление системы
print_info "Шаг 1: Обновление системы..."
apt update -qq
apt upgrade -y -qq
print_success "Система обновлена"

# Шаг 2: Установка базовых пакетов
print_info "Шаг 2: Установка базовых пакетов..."
apt install -y curl wget git build-essential > /dev/null 2>&1
print_success "Базовые пакеты установлены"

# Шаг 3: Установка PostgreSQL
print_info "Шаг 3: Установка PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib > /dev/null 2>&1
    systemctl start postgresql
    systemctl enable postgresql
    print_success "PostgreSQL установлен и запущен"
else
    print_warning "PostgreSQL уже установлен"
fi

# Шаг 4: Установка Node.js
print_info "Шаг 4: Установка Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
    print_success "Node.js установлен"
else
    NODE_VERSION=$(node --version)
    print_warning "Node.js уже установлен: $NODE_VERSION"
fi

# Шаг 5: Установка PM2
print_info "Шаг 5: Установка PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2 > /dev/null 2>&1
    print_success "PM2 установлен"
else
    print_warning "PM2 уже установлен"
fi

# Шаг 6: Установка Nginx
print_info "Шаг 6: Установка Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx > /dev/null 2>&1
    systemctl start nginx
    systemctl enable nginx
    print_success "Nginx установлен и запущен"
else
    print_warning "Nginx уже установлен"
fi

# Шаг 7: Настройка базы данных
print_info "Шаг 7: Настройка базы данных..."
print_warning "Вам нужно будет вручную создать базу данных и пользователя"
print_info "Выполните следующие команды:"
echo ""
echo "sudo -u postgres psql"
echo "CREATE USER streamdesk_user WITH PASSWORD 'ваш_пароль';"
echo "CREATE DATABASE streamdesk OWNER streamdesk_user;"
echo "GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;"
echo "\\q"
echo ""

# Шаг 8: Создание директории для проекта
print_info "Шаг 8: Создание директории для проекта..."
if [ ! -d "/var/www/streamdesk" ]; then
    mkdir -p /var/www/streamdesk
    print_success "Директория /var/www/streamdesk создана"
else
    print_warning "Директория /var/www/streamdesk уже существует"
fi

# Шаг 9: Настройка firewall
print_info "Шаг 9: Настройка firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp > /dev/null 2>&1
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    ufw --force enable > /dev/null 2>&1
    print_success "Firewall настроен"
else
    print_warning "UFW не установлен, пропускаем настройку firewall"
fi

echo ""
echo "=========================================="
print_success "Базовая установка завершена!"
echo "=========================================="
echo ""
print_info "Следующие шаги:"
echo "1. Загрузите проект в /var/www/streamdesk"
echo "2. Создайте базу данных (см. инструкции выше)"
echo "3. Создайте файл .env с настройками"
echo "4. Установите зависимости: cd /var/www/streamdesk && npm install"
echo "5. Соберите проект: npm run build"
echo "6. Настройте Nginx (см. DEPLOY_UBUNTU.md)"
echo "7. Установите SSL сертификат"
echo "8. Запустите приложение: pm2 start ecosystem.config.js"
echo ""
print_info "Подробные инструкции в файле DEPLOY_UBUNTU.md"
print_info "Для автоматического деплоя см. АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md"
echo ""

