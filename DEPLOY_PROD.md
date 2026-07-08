# Прод-деплой StreamDesk на VM (домен streamdesk.ru, HTTPS через Caddy)

Пошаговая инструкция: развернуть боевой стек с автоматическим сертификатом
Let's Encrypt и перенести старую БД/файлы. Рассчитана на то, что человек делает
это **впервые** — выполняй по порядку.

Стек поднимается одной командой `docker compose up -d --build`. Внутри три сервиса:
- **db** — PostgreSQL 16 (данные в volume `pgdata`, наружу не публикуется);
- **app** — Java-бэкенд + собранный фронт на порту 5050 (внутри docker-сети);
- **caddy** — reverse-proxy, терминирует HTTPS на портах 80/443.

---

## 0. Что нужно получить у владельца проекта (НЕ лежит в Git)

Эти файлы в `.gitignore` (там реальные секреты/данные), поэтому `git clone` их НЕ
принесёт — их передают отдельно и кладут вручную на VM:

| Файл | Куда положить на VM | Зачем |
|---|---|---|
| **`.env`** | рядом с `docker-compose.yml` (корень проекта) | домен, пароли, ключи AI |
| **`.sql`-дамп БД** | в каталог `./db-init/` (создать) | старая БД, грузится при первом старте |
| `uploads-seed/` *(если есть)* | в корень проекта | старые файлы (аватары, фото чата) |

> `.env` содержит секреты — передавать защищённым каналом (не в публичный чат).

---

## 1. Предусловия на VM

- Установлены **Docker** и **Docker Compose**.
- Наружу открыты порты **80** и **443** (443 — сайт, 80 — ACME-проверка Let's Encrypt).
- Есть SSH-доступ.

## 2. DNS

Создать **A-запись**: `streamdesk.ru` → публичный IP VM. Дождаться распространения:

```bash
nslookup streamdesk.ru        # должен вернуть IP вашей VM
```

Пока сертификат не выпустится — сайт по HTTPS не откроется, это нормально до готовности DNS.

## 3. Забрать код

```bash
git clone https://github.com/AlexbittIT/StreamDesk.git
cd StreamDesk
```

## 4. Положить `.env`

Скопировать полученный `.env` (из шага 0) в корень проекта, рядом с `docker-compose.yml`.
Проверить, что домен и режим схемы БД заданы верно:

```env
SITE_DOMAIN=streamdesk.ru
SESSION_COOKIE_SECURE=true
CORS_ALLOWED_ORIGINS=https://streamdesk.ru

POSTGRES_DB=streamdesk
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<пароль из .env>

# ПЕРВЫЙ запуск: создать/дополнить таблицы под сущности (карты/зоны S3-S4).
# После успешного старта — закомментировать (шаг 8).
SPRING_JPA_HIBERNATE_DDL_AUTO=update
```

## 5. Положить дамп БД

Дамп выполняется автоматически **только при первом старте пустой БД** (механизм
`docker-entrypoint-initdb.d`). Создать каталог и положить туда `.sql`:

```bash
mkdir -p db-init
cp /путь/к/дампу.sql db-init/
```

> Если БД уже была развёрнута ранее и volume не пустой — дамп проигнорируется.
> Перезалить с нуля (**стирает текущие данные!**):
> `docker compose down -v && docker compose up -d --build`

## 6. Первый запуск

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Caddy сам возьмёт сертификат Let's Encrypt при первом обращении к домену.
Проверка:

```bash
curl https://streamdesk.ru/api/health     # → {"status":"ok"} или аналог
```

Открыть в браузере `https://streamdesk.ru` — должно быть без предупреждений о сертификате.

## 7. Перенос старых файлов (если есть `uploads-seed/`)

```bash
docker compose cp ./uploads-seed/. app:/app/uploads/
```

## 8. После первого успешного старта — вернуть безопасную схему

В `.env` **закомментировать** строку:

```env
# SPRING_JPA_HIBERNATE_DDL_AUTO=update
```

Применить:

```bash
docker compose up -d
```

Теперь Hibernate работает в режиме `validate` и схему не меняет.

## 9. Первый вход админа (только если БД чистая, без дампа)

Временно включить fallback-админа в `.env`:

```env
ALLOW_FALLBACK_ADMIN=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<временный_пароль>
```

`docker compose up -d` → войти как `admin` → создать реального владельца платформы
через админку → в `.env` вернуть `ALLOW_FALLBACK_ADMIN=false` → `docker compose up -d`.
При заливке дампа (шаг 5) этот шаг не нужен — админ уже в данных.

---

## Доступ к БД для GUI-клиента (pgAdmin / DBeaver)

Порт **5432** проброшен **только на localhost VM** (`127.0.0.1:5432` в
`docker-compose.yml`) — наружу БД не публикуется. Подключаться через SSH-туннель:

```bash
ssh -L 5432:localhost:5432 user@streamdesk.ru
```

Затем в клиенте:

| Поле | Значение |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `streamdesk` |
| Username | `postgres` |
| Password | из `.env` (`POSTGRES_PASSWORD`) |

> Порт **5050** — это веб-приложение, к БД отношения не имеет.

---

## Обновление (выкатка новой версии)

```bash
git pull
docker compose up -d --build
docker image prune -f
```

Или автоматически через CD (GitHub Actions): задать секреты `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` в Settings → Secrets — тогда каждый
зелёный CI на ветке `main` деплоит сам.

---

## Диагностика

```bash
docker compose ps                    # статусы контейнеров
docker compose logs -f caddy         # логи Caddy (сертификат, прокси)
docker compose logs -f app           # логи бэкенда
docker compose logs -f db            # логи PostgreSQL
docker compose exec db psql -U postgres -d streamdesk   # прямой доступ к БД
```

Типовые проблемы:

- **Caddy не может взять сертификат** → проверить DNS (`nslookup streamdesk.ru`) и что порт 80 открыт наружу.
- **Браузер: ERR_CONNECTION_REFUSED** → открыт ли порт 443 и `caddy` в статусе `running` (`docker compose ps`).
- **Приложение не стартует** → `docker compose logs app`; чаще всего БД ещё не готова (подождать 1-2 мин) или неверный `POSTGRES_PASSWORD`.
- **`Schema-validation` / нет таблиц при старте** → дамп старый (нет новых таблиц карт/зон). Задать `SPRING_JPA_HIBERNATE_DDL_AUTO=update` в `.env`, `docker compose up -d`, дождаться старта, затем закомментировать (шаг 8).
- **CORS-ошибки в браузере** → `CORS_ALLOWED_ORIGINS` должен точно совпадать со схемой+доменом (`https://streamdesk.ru`, без слэша в конце).
