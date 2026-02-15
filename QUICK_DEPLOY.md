# 🚀 Быстрый деплой StreamDesk на Ubuntu

## 📋 Чек-лист перед началом

- [ ] У вас есть доступ к Ubuntu серверу (SSH)
- [ ] У вас есть IP адрес сервера
- [ ] Домен streamdesk.ru настроен в reg.ru
- [ ] SSL сертификат готов (файлы .crt и .key)

---

## ⚡ Быстрый старт (5 минут)

### 1. Подключитесь к серверу

```bash
ssh username@ваш_IP_сервера
```

### 2. Запустите скрипт автоматической установки

```bash
# Скачайте скрипт на сервер
wget https://raw.githubusercontent.com/ваш-репозиторий/deploy.sh
# Или скопируйте файл deploy.sh на сервер через SCP

# Запустите
sudo bash deploy.sh
```

### 3. Загрузите проект на сервер

**Вариант A: Через Git**
```bash
cd /var/www
sudo git clone https://github.com/ваш-репозиторий/StreamDesk.git streamdesk
sudo chown -R $USER:$USER /var/www/streamdesk
```

**Вариант B: Через SCP (с вашего Windows компьютера)**
```powershell
# В PowerShell на вашем компьютере
scp -r D:\StreamDesk username@IP_сервера:/var/www/streamdesk
```

### 4. Создайте базу данных

```bash
sudo -u postgres psql
```

В консоли PostgreSQL:
```sql
CREATE USER streamdesk_user WITH PASSWORD 'ваш_надежный_пароль';
CREATE DATABASE streamdesk OWNER streamdesk_user;
GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;
\q
```

### 5. Настройте .env файл

```bash
cd /var/www/streamdesk
nano .env
```

Вставьте:
```env
DATABASE_URL=postgresql://streamdesk_user:ваш_надежный_пароль@localhost:5432/streamdesk
PORT=5000
NODE_ENV=production
SESSION_SECRET=$(openssl rand -base64 32)
```

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### 6. Установите зависимости и соберите

```bash
npm install
npm run build
```

### 7. Настройте Nginx

```bash
sudo nano /etc/nginx/sites-available/streamdesk.ru
```

Вставьте конфигурацию из `DEPLOY_UBUNTU.md` (Шаг 7.3), заменив пути к SSL сертификатам.

Активируйте:
```bash
sudo ln -s /etc/nginx/sites-available/streamdesk.ru /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Установите SSL сертификат

```bash
sudo mkdir -p /etc/ssl/certs /etc/ssl/private
# Загрузите ваши файлы сертификата на сервер, затем:
sudo cp путь/к/certificate.crt /etc/ssl/certs/streamdesk.ru.crt
sudo cp путь/к/private.key /etc/ssl/private/streamdesk.ru.key
sudo chmod 644 /etc/ssl/certs/streamdesk.ru.crt
sudo chmod 600 /etc/ssl/private/streamdesk.ru.key
```

### 9. Запустите приложение

```bash
cd /var/www/streamdesk
pm2 start dist/index.js --name streamdesk
pm2 save
pm2 startup
# Выполните команду, которую выведет PM2
```

### 10. Настройте DNS в reg.ru

В панели управления доменом добавьте A записи:
```
streamdesk.ru     -> IP_ВАШЕГО_СЕРВЕРА
www.streamdesk.ru  -> IP_ВАШЕГО_СЕРВЕРА
```

---

## ✅ Проверка

1. Откройте `https://streamdesk.ru` в браузере
2. Должна открыться страница входа
3. Войдите: `admin` / `admin123`

---

## 🔧 Полезные команды

```bash
# Логи приложения
pm2 logs streamdesk

# Перезапуск
pm2 restart streamdesk

# Статус
pm2 status

# Логи Nginx
sudo tail -f /var/log/nginx/streamdesk.ru.error.log
```

---

## 📚 Полная инструкция

См. файл `DEPLOY_UBUNTU.md` для подробных инструкций.

---

## 🆘 Проблемы?

1. **502 Bad Gateway** → Проверьте: `pm2 status` и `pm2 logs streamdesk`
2. **SSL ошибка** → Проверьте пути к сертификатам в Nginx
3. **База данных не подключается** → Проверьте `.env` и права пользователя PostgreSQL

---

Удачи! 🎉

