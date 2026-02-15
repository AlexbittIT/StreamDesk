# Развертывание StreamDesk на домене streamdesk.ru

## 📚 Документация по деплою

- **Для Ubuntu сервера:** См. [DEPLOY_UBUNTU.md](./DEPLOY_UBUNTU.md) - полная подробная инструкция
- **Быстрый старт:** См. [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - краткая шпаргалка
- **Установка SSL:** См. [SSL_SETUP.md](./SSL_SETUP.md) - инструкция по установке SSL сертификата от reg.ru

---

## Установка зависимостей

### 1. Установите необходимые npm пакеты

```bash
npm install docx pdfkit form-data node-fetch@2
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта или настройте переменные окружения на сервере:

```env
# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/streamdesk

# Whisper X API (удаленный сервер)
WHISPER_X_API_URL=http://IP_АДРЕС_УДАЛЕННОГО_СЕРВЕРА:8000
WHISPER_X_API_KEY=your_api_key_if_needed
WHISPER_X_TIMEOUT=300000

# Домен
DOMAIN=streamdesk.ru
```

## Настройка домена streamdesk.ru

### 1. DNS настройки

Настройте DNS записи для вашего домена:

```
A запись: streamdesk.ru -> IP_АДРЕС_ВАШЕГО_СЕРВЕРА
A запись: www.streamdesk.ru -> IP_АДРЕС_ВАШЕГО_СЕРВЕРА
```

### 2. Настройка веб-сервера (Nginx)

Пример конфигурации Nginx для `streamdesk.ru`:

```nginx
server {
    listen 80;
    server_name streamdesk.ru www.streamdesk.ru;

    # Редирект на HTTPS (если используете SSL)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name streamdesk.ru www.streamdesk.ru;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    # Максимальный размер загружаемых файлов (для транскрибации)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:8458;
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

    # Статические файлы
    location /uploads {
        alias /path/to/StreamDesk/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. SSL сертификат (Let's Encrypt)

```bash
sudo certbot --nginx -d streamdesk.ru -d www.streamdesk.ru
```

## Настройка удаленного Whisper X сервера

### 1. Убедитесь, что Whisper X API доступен

На удаленном компьютере должен быть запущен API сервер Whisper X. См. `WHISPER_X_SETUP.md` для подробностей.

### 2. Проверка доступности

```bash
curl http://IP_АДРЕС_УДАЛЕННОГО_СЕРВЕРА:8000/health
```

Должен вернуть `{"status": "ok"}` или `200 OK`.

### 3. Настройка файрвола

Убедитесь, что порт 8000 (или другой порт Whisper X API) доступен с вашего веб-сервера:

```bash
# На удаленном сервере с Whisper X
sudo ufw allow from IP_ВЕБ_СЕРВЕРА to any port 8000
```

## Запуск приложения

### Development режим

```bash
npm run dev
```

### Production режим

```bash
# Сборка
npm run build

# Запуск
npm start
```

### Использование PM2 для production

```bash
# Установка PM2
npm install -g pm2

# Запуск
pm2 start dist/index.js --name streamdesk

# Автозапуск при перезагрузке
pm2 startup
pm2 save
```

## Проверка работы

1. Откройте `https://streamdesk.ru` в браузере
2. Войдите в систему
3. Перейдите в раздел "Транскрибация"
4. Загрузите аудио или видео файл
5. Выберите формат вывода (PDF, DOCX или TXT)
6. Нажмите "Транскрибировать"

## Устранение проблем

### Проблема: Транскрибация не работает

1. Проверьте доступность Whisper X API:
   ```bash
   curl http://WHISPER_X_API_URL/health
   ```

2. Проверьте логи сервера:
   ```bash
   pm2 logs streamdesk
   # или
   npm run dev
   ```

3. Убедитесь, что переменные окружения установлены правильно:
   ```bash
   echo $WHISPER_X_API_URL
   ```

### Проблема: Файлы не загружаются

1. Проверьте права доступа к папке `uploads`:
   ```bash
   chmod -R 755 uploads
   ```

2. Проверьте настройки Nginx `client_max_body_size`

### Проблема: Таймауты при транскрибации

Увеличьте таймауты в `.env`:
```env
WHISPER_X_TIMEOUT=600000  # 10 минут
```

И в Nginx конфигурации:
```nginx
proxy_read_timeout 600s;
```

