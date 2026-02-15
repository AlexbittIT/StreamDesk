# ⚡ Быстрый старт: Деплой на Ubuntu 24 Server

## 🎯 Краткое описание процесса

1. **Подготовка сервера** - установка Node.js, PostgreSQL, Nginx, PM2
2. **Настройка базы данных** - создание БД и пользователя
3. **Загрузка проекта** - копирование файлов на сервер
4. **Настройка домена** - DNS записи и SSL сертификат
5. **Автоматический деплой** - настройка синхронизации файлов

---

## 📝 Пошаговая инструкция

### Шаг 1: Подключение к серверу

```bash
ssh username@your-server-ip
```

### Шаг 2: Автоматическая установка ПО

**Вариант A: Использовать готовый скрипт**

Скопируйте файл `setup-ubuntu-server.sh` на сервер и выполните:

```bash
sudo bash setup-ubuntu-server.sh
```

**Вариант B: Установка вручную**

Выполните команды из раздела "2. Установка необходимого ПО" в файле `ПОЛНАЯ_ИНСТРУКЦИЯ_ДЕПЛОЙ_UBUNTU.md`

### Шаг 3: Создание базы данных

```bash
sudo -u postgres psql
```

В консоли PostgreSQL:

```sql
CREATE DATABASE streamdesk;
CREATE USER streamdesk_user WITH PASSWORD 'ваш_надежный_пароль';
GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;
ALTER USER streamdesk_user CREATEDB;
\q
```

### Шаг 4: Загрузка проекта на сервер

**С вашего Windows компьютера:**

1. Откройте файл `deploy-to-server.bat`
2. Измените настройки в начале файла:
   ```batch
   set SERVER_USER=ваш_пользователь
   set SERVER_IP=IP_адрес_сервера
   set SERVER_PATH=/var/www/streamdesk
   ```
3. Сохраните файл
4. Дважды кликните на `deploy-to-server.bat`

Скрипт автоматически:
- Синхронизирует файлы на сервер
- Установит зависимости
- Соберет клиент
- Запустит приложение через PM2

### Шаг 5: Настройка .env на сервере

```bash
cd /var/www/streamdesk
nano .env
```

Содержимое:

```env
DATABASE_URL=postgresql://streamdesk_user:ваш_надежный_пароль@localhost:5432/streamdesk
PORT=5000
NODE_ENV=production
HOST=0.0.0.0
```

### Шаг 6: Создание таблиц в БД

```bash
sudo -u postgres psql -d streamdesk -f create_connection_schemas_tables.sql
```

Или выполните SQL команды вручную (см. файл `create_connection_schemas_tables.sql`)

### Шаг 7: Настройка Nginx

```bash
sudo nano /etc/nginx/sites-available/streamdesk
```

Скопируйте конфигурацию из файла `nginx-config-example.conf`, заменив `ваш-домен.com` на ваш домен.

Активируйте:

```bash
sudo ln -s /etc/nginx/sites-available/streamdesk /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 8: Установка SSL (Let's Encrypt - бесплатно)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com
```

### Шаг 9: Настройка DNS

В панели управления вашего регистратора домена добавьте A-запись:

```
Тип: A
Имя: @
Значение: IP_адрес_вашего_сервера
TTL: 3600
```

---

## 🔄 Автоматический деплой при обновлении файлов

После первоначальной настройки, каждый раз когда вы обновляете файлы:

1. Дважды кликните на `deploy-to-server.bat`
2. Скрипт автоматически синхронизирует файлы и перезапустит приложение

**Или используйте Git:**

Если настроили Git репозиторий, просто делайте:

```bash
git push origin main
```

И изменения автоматически применятся на сервере (если настроен GitHub Actions или Git Hooks).

---

## ✅ Проверка работы

1. Откройте браузер: `https://ваш-домен.com`
2. Должна открыться страница входа
3. Войдите с учетными данными администратора

---

## 📚 Подробные инструкции

- **Полная инструкция:** `ПОЛНАЯ_ИНСТРУКЦИЯ_ДЕПЛОЙ_UBUNTU.md`
- **Автоматический деплой:** `АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md`
- **Существующая инструкция:** `DEPLOY_UBUNTU.md`

---

## 🆘 Решение проблем

### Приложение не запускается

```bash
pm2 logs streamdesk --lines 50
cat .env
```

### 502 Bad Gateway

```bash
pm2 status
sudo tail -f /var/log/nginx/streamdesk-error.log
```

### Домен не работает

```bash
nslookup ваш-домен.com
sudo nginx -t
```

---

Удачи! 🚀

