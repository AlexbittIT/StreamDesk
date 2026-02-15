# Полная инструкция по деплою StreamDesk на Ubuntu сервер

## 📋 Требования

- Ubuntu 20.04 или новее
- Root доступ или пользователь с sudo правами
- Домен streamdesk.ru (уже куплен)
- SSL сертификат (уже куплен)
- IP адрес вашего сервера

---

## 🔧 Шаг 1: Подготовка сервера

### 1.1. Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2. Установка необходимых пакетов

```bash
sudo apt install -y curl wget git build-essential
```

---

## 🗄️ Шаг 2: Установка PostgreSQL

### 2.1. Установка PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

### 2.2. Запуск PostgreSQL

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.3. Создание базы данных и пользователя

```bash
sudo -u postgres psql
```

В консоли PostgreSQL выполните:

```sql
-- Создание пользователя
CREATE USER streamdesk_user WITH PASSWORD 'ваш_надежный_пароль';

-- Создание базы данных
CREATE DATABASE streamdesk OWNER streamdesk_user;

-- Предоставление прав
GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;

-- Выход
\q
```

**⚠️ ВАЖНО:** Замените `ваш_надежный_пароль` на реальный пароль!

---

## 📦 Шаг 3: Установка Node.js

### 3.1. Установка Node.js 20.x (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3.2. Проверка установки

```bash
node --version  # Должно быть v20.x.x
npm --version   # Должно быть 10.x.x
```

### 3.3. Установка PM2 (менеджер процессов)

```bash
sudo npm install -g pm2
```

---

## 📥 Шаг 4: Загрузка проекта на сервер

### 4.1. Клонирование репозитория (если используете Git)

```bash
cd /var/www
sudo git clone https://github.com/ваш-репозиторий/StreamDesk.git streamdesk
sudo chown -R $USER:$USER /var/www/streamdesk
cd streamdesk
```

### 4.2. Или загрузка через SCP/SFTP

Если у вас проект на локальном компьютере, загрузите его на сервер:

```bash
# С вашего локального компьютера (Windows PowerShell)
scp -r D:\StreamDesk username@ваш_IP_сервера:/var/www/streamdesk
```

Или используйте WinSCP / FileZilla для загрузки файлов.

### 4.3. Установка зависимостей

```bash
cd /var/www/streamdesk
npm install
```

---

## ⚙️ Шаг 5: Настройка переменных окружения

### 5.1. Создание файла .env

```bash
cd /var/www/streamdesk
nano .env
```

### 5.2. Содержимое файла .env

```env
# База данных (замените на ваши данные)
DATABASE_URL=postgresql://streamdesk_user:ваш_надежный_пароль@localhost:5432/streamdesk

# Порт приложения
PORT=5000

# Режим работы
NODE_ENV=production

# Whisper X API (если используете удаленный сервер)
WHISPER_X_API_URL=http://IP_УДАЛЕННОГО_СЕРВЕРА:8000
WHISPER_X_API_KEY=your_api_key_if_needed
WHISPER_X_TIMEOUT=300000

# Домен
DOMAIN=streamdesk.ru

# Секретный ключ для сессий (сгенерируйте случайную строку)
SESSION_SECRET=ваш_случайный_секретный_ключ_минимум_32_символа
```

**⚠️ ВАЖНО:** 
- Замените `ваш_надежный_пароль` на пароль из шага 2.3
- Замените `ваш_случайный_секретный_ключ_минимум_32_символа` на случайную строку (можно сгенерировать: `openssl rand -base64 32`)

### 5.3. Сохранение файла

Нажмите `Ctrl+O` для сохранения, затем `Enter`, затем `Ctrl+X` для выхода.

---

## 🔨 Шаг 6: Сборка проекта

```bash
cd /var/www/streamdesk
npm run build
```

Это создаст папку `dist` с собранным приложением.

---

## 🌐 Шаг 7: Настройка Nginx

### 7.1. Установка Nginx

```bash
sudo apt install -y nginx
```

### 7.2. Создание конфигурации для streamdesk.ru

```bash
sudo nano /etc/nginx/sites-available/streamdesk.ru
```

### 7.3. Содержимое конфигурации

```nginx
# Редирект HTTP на HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name streamdesk.ru www.streamdesk.ru;

    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name streamdesk.ru www.streamdesk.ru;

    # Пути к SSL сертификатам (замените на ваши пути)
    ssl_certificate /etc/ssl/certs/streamdesk.ru.crt;
    ssl_certificate_key /etc/ssl/private/streamdesk.ru.key;

    # Настройки SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Максимальный размер загружаемых файлов (для транскрибации)
    client_max_body_size 500M;

    # Логи
    access_log /var/log/nginx/streamdesk.ru.access.log;
    error_log /var/log/nginx/streamdesk.ru.error.log;

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
        
        # Таймауты для длительных операций транскрибации
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Статические файлы (если есть)
    location /uploads {
        alias /var/www/streamdesk/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 7.4. Установка SSL сертификата

Если у вас уже есть SSL сертификат от reg.ru:

```bash
# Создайте директории для сертификатов
sudo mkdir -p /etc/ssl/certs
sudo mkdir -p /etc/ssl/private

# Скопируйте ваш сертификат и ключ
# Замените пути на реальные пути к вашим файлам
sudo cp /path/to/your/certificate.crt /etc/ssl/certs/streamdesk.ru.crt
sudo cp /path/to/your/private.key /etc/ssl/private/streamdesk.ru.key

# Установите правильные права
sudo chmod 644 /etc/ssl/certs/streamdesk.ru.crt
sudo chmod 600 /etc/ssl/private/streamdesk.ru.key
```

### 7.5. Активация конфигурации

```bash
# Создать символическую ссылку
sudo ln -s /etc/nginx/sites-available/streamdesk.ru /etc/nginx/sites-enabled/

# Удалить дефолтную конфигурацию (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверить конфигурацию
sudo nginx -t

# Перезапустить Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 🔥 Шаг 8: Настройка Firewall

### 8.1. Настройка UFW

```bash
# Разрешить SSH (важно сделать первым!)
sudo ufw allow 22/tcp

# Разрешить HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включить firewall
sudo ufw enable

# Проверить статус
sudo ufw status
```

---

## 🚀 Шаг 9: Запуск приложения через PM2

### 9.1. Запуск приложения

```bash
cd /var/www/streamdesk
pm2 start dist/index.js --name streamdesk
```

### 9.2. Настройка автозапуска

```bash
# Сохранить текущий список процессов
pm2 save

# Настроить автозапуск при перезагрузке системы
pm2 startup
# Выполните команду, которую выведет PM2 (обычно что-то вроде):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ваш_пользователь --hp /home/ваш_пользователь
```

### 9.3. Полезные команды PM2

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

---

## 🌍 Шаг 10: Настройка DNS

### 10.1. Настройка DNS записей в reg.ru

Зайдите в панель управления доменом на reg.ru и настройте DNS записи:

**A записи:**
```
streamdesk.ru        -> IP_ВАШЕГО_СЕРВЕРА
www.streamdesk.ru    -> IP_ВАШЕГО_СЕРВЕРА
```

**Как узнать IP сервера:**
```bash
curl ifconfig.me
# или
hostname -I
```

### 10.2. Проверка DNS

После настройки DNS подождите несколько минут (до 24 часов для полного распространения) и проверьте:

```bash
# С вашего локального компьютера
nslookup streamdesk.ru
ping streamdesk.ru
```

---

## ✅ Шаг 11: Проверка работы

### 11.1. Проверка приложения

1. Откройте браузер и перейдите на `https://streamdesk.ru`
2. Должна открыться страница входа
3. Если видите ошибку SSL, проверьте путь к сертификатам в Nginx

### 11.2. Проверка логов

```bash
# Логи приложения
pm2 logs streamdesk

# Логи Nginx
sudo tail -f /var/log/nginx/streamdesk.ru.error.log
sudo tail -f /var/log/nginx/streamdesk.ru.access.log
```

### 11.3. Проверка базы данных

```bash
# Подключение к базе данных
sudo -u postgres psql -d streamdesk

# Проверка таблиц
\dt

# Выход
\q
```

---

## 🔄 Шаг 12: Обновление приложения

Когда нужно обновить приложение:

```bash
cd /var/www/streamdesk

# Если используете Git
git pull

# Установка новых зависимостей (если есть)
npm install

# Пересборка
npm run build

# Перезапуск через PM2
pm2 restart streamdesk
```

---

## 🛠️ Устранение проблем

### Проблема: Приложение не запускается

```bash
# Проверьте логи
pm2 logs streamdesk --lines 50

# Проверьте переменные окружения
cd /var/www/streamdesk
cat .env

# Проверьте подключение к базе данных
psql -U streamdesk_user -d streamdesk -h localhost
```

### Проблема: 502 Bad Gateway

```bash
# Проверьте, запущено ли приложение
pm2 status

# Проверьте порт
sudo netstat -tlnp | grep 5000

# Проверьте логи Nginx
sudo tail -f /var/log/nginx/streamdesk.ru.error.log
```

### Проблема: SSL сертификат не работает

```bash
# Проверьте пути к сертификатам
sudo ls -la /etc/ssl/certs/streamdesk.ru.crt
sudo ls -la /etc/ssl/private/streamdesk.ru.key

# Проверьте права доступа
sudo chmod 644 /etc/ssl/certs/streamdesk.ru.crt
sudo chmod 600 /etc/ssl/private/streamdesk.ru.key

# Проверьте конфигурацию Nginx
sudo nginx -t
```

### Проблема: База данных не подключается

```bash
# Проверьте, запущен ли PostgreSQL
sudo systemctl status postgresql

# Проверьте подключение
psql -U streamdesk_user -d streamdesk -h localhost

# Проверьте файл .env
cat /var/www/streamdesk/.env | grep DATABASE_URL
```

---

## 📝 Дополнительные настройки

### Настройка автоматических бэкапов базы данных

Создайте скрипт для бэкапа:

```bash
sudo nano /usr/local/bin/backup-streamdesk.sh
```

Содержимое:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/streamdesk"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump -U streamdesk_user streamdesk > $BACKUP_DIR/streamdesk_$DATE.sql
find $BACKUP_DIR -name "streamdesk_*.sql" -mtime +7 -delete
```

Сделайте исполняемым:

```bash
sudo chmod +x /usr/local/bin/backup-streamdesk.sh
```

Добавьте в cron (ежедневно в 2:00):

```bash
sudo crontab -e
```

Добавьте строку:

```
0 2 * * * /usr/local/bin/backup-streamdesk.sh
```

---

## 🎉 Готово!

Ваш сайт должен быть доступен по адресу **https://streamdesk.ru**

**Учетные данные по умолчанию:**
- Логин: `admin`
- Пароль: `admin123`

**⚠️ ВАЖНО:** Смените пароль администратора после первого входа!

---

## 📞 Полезные команды для мониторинга

```bash
# Статус всех сервисов
sudo systemctl status nginx
sudo systemctl status postgresql
pm2 status

# Использование ресурсов
htop
# или
top

# Использование диска
df -h

# Использование памяти
free -h
```

---

## 🔐 Безопасность

1. **Смените пароль администратора** после первого входа
2. **Используйте сильные пароли** для базы данных
3. **Регулярно обновляйте систему**: `sudo apt update && sudo apt upgrade`
4. **Настройте fail2ban** для защиты от брутфорса:
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```
5. **Настройте SSH ключи** вместо паролей для SSH доступа

---

Удачи с деплоем! 🚀

