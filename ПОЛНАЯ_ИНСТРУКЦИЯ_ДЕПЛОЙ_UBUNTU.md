# 🚀 Полная инструкция по развертыванию StreamDesk на Ubuntu 24 Server

## 📋 Содержание

1. [Подготовка сервера](#1-подготовка-сервера)
2. [Установка необходимого ПО](#2-установка-необходимого-по)
3. [Настройка базы данных](#3-настройка-базы-данных)
4. [Загрузка проекта на сервер](#4-загрузка-проекта-на-сервер)
5. [Настройка переменных окружения](#5-настройка-переменных-окружения)
6. [Настройка домена и SSL](#6-настройка-домена-и-ssl)
7. [Настройка автоматического деплоя](#7-настройка-автоматического-деплоя)
8. [Запуск приложения](#8-запуск-приложения)
9. [Проверка работы](#9-проверка-работы)

---

## 1. Подготовка сервера

### 1.1 Подключение к серверу по SSH

**С вашего Windows компьютера:**

```bash
# Через PowerShell или Git Bash
ssh username@your-server-ip
# Например: ssh user@192.168.1.100

# При первом подключении введите пароль
```

### 1.2 Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

### 1.3 Настройка файрвола

```bash
# Установка UFW (если не установлен)
sudo apt install -y ufw

# ⚠️ ВАЖНО! Сначала разрешите SSH, иначе можете потерять доступ!
sudo ufw allow 22/tcp

# Разрешаем HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включаем файрвол
sudo ufw enable

# Проверяем статус
sudo ufw status
```

---

## 2. Установка необходимого ПО

### 2.1 Установка Node.js 20.x

```bash
# Установка Node.js через NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версии
node --version  # Должно быть v20.x.x
npm --version   # Должно быть 10.x.x
```

### 2.2 Установка PostgreSQL

```bash
# Установка PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Запуск и автозапуск PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Проверка статуса
sudo systemctl status postgresql
```

### 2.3 Настройка PostgreSQL

```bash
# Переключение на пользователя postgres
sudo -u postgres psql
```

В консоли PostgreSQL выполните:

```sql
-- Создание базы данных
CREATE DATABASE streamdesk;

-- Создание пользователя (замените пароль на надежный!)
CREATE USER streamdesk_user WITH PASSWORD 'ваш_надежный_пароль';

-- Предоставление прав
GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;
ALTER USER streamdesk_user CREATEDB;

-- Выход
\q
```

### 2.4 Установка Nginx

```bash
sudo apt install -y nginx

# Запуск и автозапуск Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Проверка статуса
sudo systemctl status nginx
```

### 2.5 Установка PM2 (менеджер процессов Node.js)

```bash
sudo npm install -g pm2

# Настройка автозапуска PM2
pm2 startup systemd
# Выполните команду, которую выведет PM2 (она будет начинаться с sudo)
# Например: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ваш_пользователь --hp /home/ваш_пользователь
```

---

## 3. Настройка базы данных

### 3.1 Создание таблиц

Выполните SQL скрипт для создания всех необходимых таблиц:

```bash
# Если у вас есть файл create_connection_schemas_tables.sql
sudo -u postgres psql -d streamdesk -f /path/to/create_connection_schemas_tables.sql

# Или подключитесь вручную и выполните SQL команды
sudo -u postgres psql -d streamdesk
```

---

## 4. Загрузка проекта на сервер

### Вариант A: Через Git (если проект в репозитории)

```bash
# Создаем директорию для проектов
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www

# Клонируем репозиторий
git clone https://github.com/your-username/StreamDesk.git streamdesk
cd streamdesk
```

### Вариант B: Через rsync (с вашего Windows компьютера)

**На вашем Windows компьютере:**

1. Установите Git Bash или используйте WSL
2. Откройте Git Bash в папке проекта
3. Выполните:

```bash
# Синхронизация файлов на сервер
rsync -avz --exclude 'node_modules' --exclude '.git' \
  --exclude 'client/node_modules' --exclude 'client/dist' \
  ./ username@your-server-ip:/var/www/streamdesk/
```

### Вариант C: Через SCP (одноразовая загрузка)

```bash
# С вашего Windows компьютера (PowerShell)
scp -r D:\StreamDesk username@your-server-ip:/var/www/streamdesk
```

---

## 5. Настройка переменных окружения

### 5.1 Создание файла .env

```bash
cd /var/www/streamdesk
nano .env
```

### 5.2 Содержимое файла .env

```env
# База данных (замените пароль на ваш!)
DATABASE_URL=postgresql://streamdesk_user:ваш_надежный_пароль@localhost:5432/streamdesk

# Сервер
PORT=5000
NODE_ENV=production
HOST=0.0.0.0

# Секретный ключ для сессий (сгенерируйте случайную строку)
# Выполните на сервере: openssl rand -base64 32
SESSION_SECRET=ваш_случайный_секретный_ключ_минимум_32_символа
```

Сохраните файл: `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.3 Установка зависимостей

```bash
cd /var/www/streamdesk

# Установка зависимостей сервера
npm install

# Установка зависимостей клиента и сборка
cd client
npm install
npm run build
cd ..
```

---

## 6. Настройка домена и SSL

### 6.1 Настройка DNS

В панели управления вашего регистратора домена добавьте A-запись:

```
Тип: A
Имя: @ (или www для поддомена)
Значение: IP_адрес_вашего_сервера
TTL: 3600
```

**Как узнать IP сервера:**

```bash
curl ifconfig.me
# или
hostname -I
```

### 6.2 Настройка Nginx

```bash
# Создаем конфигурацию для вашего домена
sudo nano /etc/nginx/sites-available/streamdesk
```

Содержимое файла (замените `ваш-домен.com` на ваш домен):

```nginx
server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;

    # Логи
    access_log /var/log/nginx/streamdesk-access.log;
    error_log /var/log/nginx/streamdesk-error.log;

    # Максимальный размер загружаемых файлов
    client_max_body_size 100M;

    # Проксирование на Node.js приложение
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Статические файлы
    location /uploads {
        alias /var/www/streamdesk/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Активируем конфигурацию:

```bash
# Создаем символическую ссылку
sudo ln -s /etc/nginx/sites-available/streamdesk /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
sudo nginx -t

# Перезагружаем Nginx
sudo systemctl reload nginx
```

### 6.3 Установка SSL сертификата (Let's Encrypt - бесплатно)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL сертификата
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com

# Следуйте инструкциям на экране
# Certbot автоматически обновит конфигурацию Nginx и настроит редирект с HTTP на HTTPS

# Автоматическое обновление сертификата (проверка)
sudo certbot renew --dry-run
```

**Если у вас уже есть SSL сертификат от регистратора:**

```bash
# Создайте директории для сертификатов
sudo mkdir -p /etc/ssl/certs
sudo mkdir -p /etc/ssl/private

# Скопируйте ваш сертификат и ключ
sudo cp /path/to/your/certificate.crt /etc/ssl/certs/streamdesk.crt
sudo cp /path/to/your/private.key /etc/ssl/private/streamdesk.key

# Установите правильные права
sudo chmod 644 /etc/ssl/certs/streamdesk.crt
sudo chmod 600 /etc/ssl/private/streamdesk.key

# Обновите конфигурацию Nginx (добавьте SSL настройки)
sudo nano /etc/nginx/sites-available/streamdesk
```

Добавьте SSL настройки в конфигурацию Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name ваш-домен.com www.ваш-домен.com;

    ssl_certificate /etc/ssl/certs/streamdesk.crt;
    ssl_certificate_key /etc/ssl/private/streamdesk.key;
    
    # ... остальная конфигурация
}

# Редирект HTTP на HTTPS
server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 7. Настройка автоматического деплоя

### 7.1 Вариант 1: Через rsync (Рекомендуется)

**Шаг 1: Настройка SSH ключей**

На вашем Windows компьютере:

```bash
# Генерация SSH ключа (если еще нет)
ssh-keygen -t rsa -b 4096

# Копирование ключа на сервер
ssh-copy-id username@your-server-ip
```

**Шаг 2: Создание скрипта деплоя на сервере**

На сервере:

```bash
cd /var/www/streamdesk
nano deploy-to-server.sh
```

Скопируйте содержимое из файла `deploy-to-server.sh` (см. файл в проекте)

Сделайте исполняемым:

```bash
chmod +x deploy-to-server.sh
```

**Шаг 3: Создание скрипта деплоя на Windows**

На вашем компьютере откройте файл `deploy-to-server.bat` и измените настройки:

```batch
set SERVER_USER=ваш_пользователь
set SERVER_IP=IP_адрес_сервера
set SERVER_PATH=/var/www/streamdesk
```

**Шаг 4: Использование**

Каждый раз, когда вы обновляете файлы:

1. Дважды кликните на `deploy-to-server.bat`
2. Скрипт автоматически синхронизирует файлы и перезапустит приложение

### 7.2 Вариант 2: Через Git + GitHub Actions

См. файл `АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md` для подробных инструкций.

### 7.3 Вариант 3: Через Git Hooks

См. файл `АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md` для подробных инструкций.

---

## 8. Запуск приложения

### 8.1 Запуск через PM2

```bash
cd /var/www/streamdesk

# Запуск приложения
pm2 start ecosystem.config.js

# Или если файла нет:
pm2 start server/index.ts --name streamdesk --interpreter npx --interpreter-args "tsx"

# Сохранение конфигурации PM2
pm2 save

# Проверка статуса
pm2 status
pm2 logs streamdesk
```

### 8.2 Проверка автозапуска

```bash
# Проверьте, что PM2 настроен на автозапуск
pm2 startup

# Перезагрузите сервер и проверьте, что приложение запустилось автоматически
sudo reboot
# После перезагрузки:
pm2 status
```

---

## 9. Проверка работы

### 9.1 Проверка статуса сервисов

```bash
# Проверка PM2
pm2 status
pm2 logs streamdesk

# Проверка Nginx
sudo systemctl status nginx

# Проверка PostgreSQL
sudo systemctl status postgresql
```

### 9.2 Проверка доступности

```bash
# Проверка локально на сервере
curl http://localhost:5000

# Проверка через домен
curl http://ваш-домен.com
curl https://ваш-домен.com
```

### 9.3 Открытие в браузере

Откройте в браузере: `https://ваш-домен.com`

Должна открыться страница входа в приложение.

---

## 🔧 Решение проблем

### Проблема: Приложение не запускается

```bash
# Проверьте логи
pm2 logs streamdesk --lines 50

# Проверьте .env файл
cat .env

# Проверьте подключение к БД
sudo -u postgres psql -d streamdesk -c "SELECT 1;"
```

### Проблема: 502 Bad Gateway

```bash
# Проверьте, запущено ли приложение
pm2 status

# Проверьте порт
sudo netstat -tlnp | grep :5000

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/streamdesk-error.log
```

### Проблема: Домен не работает

```bash
# Проверьте DNS
nslookup ваш-домен.com

# Проверьте конфигурацию Nginx
sudo nginx -t

# Проверьте файрвол
sudo ufw status
```

### Проблема: SSL сертификат не работает

```bash
# Проверьте пути к сертификатам
sudo ls -la /etc/ssl/certs/streamdesk.crt
sudo ls -la /etc/ssl/private/streamdesk.key

# Проверьте конфигурацию Nginx
sudo nginx -t

# Перезагрузите Nginx
sudo systemctl reload nginx
```

---

## 📝 Полезные команды

### Управление приложением

```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs streamdesk

# Перезапуск
pm2 restart streamdesk

# Остановка
pm2 stop streamdesk

# Удаление из PM2
pm2 delete streamdesk
```

### Управление Nginx

```bash
# Проверка конфигурации
sudo nginx -t

# Перезагрузка конфигурации
sudo systemctl reload nginx

# Перезапуск
sudo systemctl restart nginx

# Просмотр логов
sudo tail -f /var/log/nginx/streamdesk-access.log
sudo tail -f /var/log/nginx/streamdesk-error.log
```

### Управление базой данных

```bash
# Подключение к базе данных
sudo -u postgres psql -d streamdesk

# Бэкап базы данных
sudo -u postgres pg_dump streamdesk > backup.sql

# Восстановление из бэкапа
sudo -u postgres psql -d streamdesk < backup.sql
```

---

## ✅ Готово!

Теперь ваше приложение доступно по адресу `https://ваш-домен.com`

При каждом обновлении файлов (в зависимости от выбранного метода деплоя) изменения будут автоматически применяться на сервере.

---

## 📚 Дополнительные ресурсы

- Быстрый старт: `QUICK_DEPLOY.md`
- Автоматический деплой: `АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md`
- Скрипт автоматической установки: `deploy.sh`

---

Удачи с деплоем! 🚀

