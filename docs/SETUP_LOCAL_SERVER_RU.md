# StreamDesk: локальный сервер на вашем ПК

Эта инструкция для варианта, когда компьютер стоит как постоянный сервер, CRM работает локально, а потом открывается по купленному домену.

## 1. Установить базу PostgreSQL

1. Скачайте PostgreSQL для Windows с официального сайта: `https://www.postgresql.org/download/windows/`.
2. При установке оставьте порт `5432`.
3. Запомните пароль пользователя `postgres`.
4. Откройте `pgAdmin` или `SQL Shell (psql)` и создайте отдельную базу и пользователя:

```sql
CREATE DATABASE streamdesk;
CREATE USER streamdesk_user WITH ENCRYPTED PASSWORD 'замените_на_сложный_пароль';
GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;
```

Если PostgreSQL 15+ ругается на права схемы, выполните в базе `streamdesk`:

```sql
GRANT ALL ON SCHEMA public TO streamdesk_user;
ALTER SCHEMA public OWNER TO streamdesk_user;
```

## 2. Настроить `.env`

В файле `.env` поставьте реальную строку подключения:

```env
DATABASE_URL=postgresql://streamdesk_user:замените_на_сложный_пароль@localhost:5432/streamdesk
PORT=5000
NODE_ENV=development
YOUGILE_API_KEY=ваш_ключ_yougile
YOUGILE_BASE_URL=https://yougile.com/api-v2
YOUGILE_SYNC_INTERVAL_MS=120000
SESSION_SECRET=сгенерируйте_длинную_строку
```

`YOUGILE_SYNC_INTERVAL_MS=120000` означает подтяжку YouGile примерно раз в 2 минуты. Ниже `60000` ставить не стоит из-за лимита API.

## 3. Создать таблицы и запустить CRM

В PowerShell из папки проекта:

```powershell
npm install
npm run db:push
npm run dev
```

Открывать локально: `http://localhost:5000`.

## 4. Сделать доступ по домену

1. У провайдера домена создайте `A`-запись на внешний IP вашего интернета.
2. На роутере пробросьте порты `80` и `443` на IP этого компьютера в локальной сети.
3. Лучше поставить Caddy как HTTPS-прокси, чтобы он сам выпускал SSL-сертификат.
4. Пример `Caddyfile`:

```caddyfile
ваш-домен.ru {
  reverse_proxy localhost:5000
}
```

5. Для продакшена соберите приложение:

```powershell
npm run build
npm start
```

Если IP у провайдера динамический, нужен статический IP или DDNS, иначе домен будет периодически отваливаться.

## 5. Быстрый входящий синк YouGile

Сервер сам подтягивает YouGile по расписанию через очередь. Если в YouGile можно настроить webhook, укажите URL:

```text
https://ваш-домен.ru/api/yougile/webhook
```

Для защиты можно добавить в `.env`:

```env
YOUGILE_WEBHOOK_SECRET=любая_секретная_строка
```

Тогда webhook должен передавать этот секрет в заголовке `x-yougile-webhook-secret` или query-параметре `?secret=...`.
