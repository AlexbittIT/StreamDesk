# Instr — как устроен запуск StreamDesk в Docker

Документ объясняет: что делает `Dockerfile`, как работает `.env`, как создаётся база данных и какие флаги (переменные окружения) у нас есть и за что они отвечают.

---

## 1. Что запускает Dockerfile

`Dockerfile` собирает образ приложения в **два этапа** (multi-stage build).

### Этап 1 — `builder` (сборка)
```dockerfile
FROM node:20-bookworm-slim AS builder
COPY package.json package-lock.json* ./
RUN npm ci            # установка всех зависимостей
COPY . .
RUN npm run build     # сборка: frontend → dist/public, backend → dist/index.js
```
Здесь ставятся зависимости и собирается проект. Этот «тяжёлый» образ в финал не попадает.

### Этап 2 — `production` (рабочий образ)
```dockerfile
FROM node:20-bookworm-slim AS production
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/package.json ./package.json
EXPOSE 5000
CMD ["sh", "-c", "npm run db:push && npm start"]
```
В финальный (лёгкий) образ копируется только нужное для запуска:
- `node_modules` — зависимости (включая `drizzle-kit` для `db:push`);
- `dist` — результат сборки (собранный backend + frontend);
- `drizzle.config.ts` и `shared/` — нужны, чтобы накатить схему БД;
- `package.json` — для npm-команд.

**Что происходит при старте контейнера (`CMD`):**
1. `npm run db:push` — накатывает схему из `shared/schema.ts` в PostgreSQL (создаёт/обновляет таблицы);
2. `npm start` — запускает сервер на порту `5000`.

> ⚠️ Папка `scripts/` в образ **не копируется**, поэтому раздача агента (`/api/agents/script/windows`) внутри контейнера пока не работает. Это известный момент — чинится строкой `COPY --from=builder /app/scripts ./scripts`.

### docker-compose: два контейнера
- **`app`** — само приложение (этот Dockerfile), порт `5000:5000`.
- **`db`** — `postgres:16-alpine`, данные в томе `pgdata`.
- `app` стартует только после того, как `db` пройдёт healthcheck (`pg_isready`).

Запуск всего: `docker compose up --build` → приложение на http://localhost:5000

---

## 2. Как работает файл `.env`

`.env` — это **настройки** проекта (значения, не код). В Docker он используется **двумя способами одновременно**:

### Роль А — подстановка `${...}` в docker-compose.yml
Compose читает `.env` ещё на твоём компьютере и подставляет значения в текст compose-файла.
```yaml
DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-streamdesk}
```
- `${VAR:-default}` = «взять `VAR` из `.env`, а если нет — подставить `default`».
- Поэтому даже без `.env` всё поднимется на значениях по умолчанию.

### Роль Б — `env_file: .env`
```yaml
  app:
    env_file:
      - .env
```
Все строки `KEY=VALUE` из `.env` забрасываются как переменные окружения **внутрь контейнера `app`** (так туда попадают `ALLOW_INSECURE_LOGIN`, `LABEL_PRINTER_*` и т.д.).

### Важный нюанс: приоритет
**`environment:` побеждает `env_file:`.** Поэтому `DATABASE_URL` из `.env` под Docker **игнорируется** — действует версия из `docker-compose.yml` (с хостом `db`, а не `localhost`).
- Меняешь логин/пароль БД → правишь `POSTGRES_*` (уходят и в БД, и в `DATABASE_URL`).
- `DATABASE_URL` в `.env` под Docker трогать не нужно.

> Хост `db` — это имя сервиса из compose. Контейнеры в одной сети видят друг друга по именам сервисов. Без Docker был бы `localhost`.

---

## 3. Как создаётся база данных

`.env` сам **ничего не создаёт** — он только даёт имя и пароль. Создают двое:

### Создатель №1 — контейнер PostgreSQL (пустая БД + пользователь)
При **первом** запуске контейнера `db` (с пустым томом `pgdata`) образ postgres читает `POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD` и создаёт пустую базу с этим именем и пользователя с этим паролем.

### Создатель №2 — приложение (таблицы)
При старте контейнера `app` выполняется `npm run db:push`. Это запускает `drizzle-kit`, который:
1. читает описание из `shared/schema.ts`;
2. смотрит, что уже есть в БД;
3. вычисляет разницу и генерирует реальный SQL (`CREATE TABLE ...`);
4. выполняет его в Postgres.

```
.env ──значения──► postgres-контейнер ──создаёт──► пустая БД + пользователь
                   app: npm run db:push ──создаёт──► таблицы (из shared/schema.ts)
```

### Где лежат файлы БД
В именованном томе Docker **`streamdesk_pgdata`** (внутри WSL2-диска Docker Desktop), а не в папке проекта. Управление — только через Docker:
```bash
docker volume ls
docker volume inspect streamdesk_pgdata
```

### Жизненный цикл данных
| Команда | Данные БД |
|---|---|
| `docker compose down` | целы (том остаётся) |
| `docker compose up` снова | подхватывает ту же базу |
| пересборка `app` (`--build`) | базы не касается |
| `docker compose down -v` | **удаляются** (база с нуля) |

> Postgres создаёт БД из `POSTGRES_*` только при первом запуске с пустым томом. Сменить пароль через `.env` задним числом нельзя — нужно менять внутри БД или удалять том (`down -v`).

### Схема БД
- **`shared/schema.ts`** — источник правды (все таблицы и поля на TypeScript через Drizzle ORM).
- `drizzle.config.ts` — указывает, где схема и куда подключаться.
- Менять структуру БД = править `shared/schema.ts`, затем `npm run db:push`.

---

## 4. Флаги (переменные окружения) и за что отвечают

### Базовые / БД
| Флаг | Назначение |
|---|---|
| `POSTGRES_DB` | имя базы (создаётся контейнером postgres) |
| `POSTGRES_USER` | пользователь БД |
| `POSTGRES_PASSWORD` | пароль БД |
| `DATABASE_URL` | строка подключения к БД. **Под Docker игнорируется** (compose задаёт свою с хостом `db`). Нужна для запуска без Docker. |
| `PORT` | порт сервера (по умолчанию `5000`) |
| `NODE_ENV` | `development` или `production`. Влияет на строгость проверок безопасности. |

### Безопасность / вход
| Флаг | Назначение |
|---|---|
| `ALLOW_INSECURE_LOGIN` | `true` — разрешает вход по паролю по **HTTP** даже в production (для локального теста без SSL). На боевом домене должно быть `false`/убрано. |
| `ALLOW_FALLBACK_ADMIN` | пока не `false` — работает запасной вход `admin` / `admin123` без БД. В production обязательно `false`. |
| `SESSION_SECRET` | секрет для подписи сессий. В production обязателен (длинная случайная строка). Сгенерировать: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SESSION_COOKIE_SECURE` | помечать ли cookie сессии как `secure` (только по HTTPS). |
| `SSL_CERT_PATH` / `SSL_KEY_PATH` | пути к сертификату и ключу. Если заданы — приложение работает по HTTPS. Иначе по HTTP. |

### Платформенный админ
| Флаг | Назначение |
|---|---|
| `PLATFORM_ADMIN_USERNAME` | логин владельца платформы |
| `PLATFORM_ADMIN_PASSWORD` | пароль владельца платформы |
| `PLATFORM_ADMIN_EMAIL` | email владельца платформы |
| `PLATFORM_ADMIN_NAME` | отображаемое имя владельца платформы |

### Агент StreamDesk (мониторинг ПК / серверов / vMix)
| Флаг | Назначение |
|---|---|
| `STREAMDESK_AGENT_TOKEN` | общий токен для агента. Должен совпадать на сервере и на агенте, если CRM доступна не только локально. В development без токена агент разрешён. |

### Принтер этикеток (TSC/TSPL)
| Флаг | Назначение |
|---|---|
| `LABEL_PRINTER_HOST` | IP принтера этикеток |
| `LABEL_PRINTER_PORT` | порт RAW-печати (обычно `9100`) |
| `LABEL_PRINTER_DPI` | разрешение печати (напр. `300`) |
| `LABEL_WIDTH_MM` / `LABEL_HEIGHT_MM` / `LABEL_GAP_MM` | размеры этикетки и зазор, мм |

### Интеграции / AI
| Флаг | Назначение |
|---|---|
| `YOUGILE_API_KEY` | ключ API таск-менеджера YouGile. Без него синхронизация только локальная. |
| `YOUGILE_BASE_URL` | базовый URL API YouGile |
| `YOUGILE_COMPANY_ID` | ID компании YouGile для внешней синхронизации |
| `YOUGILE_DEFAULT_COLUMN_ID` | ID колонки для новых задач из CRM |
| `HUGGINGFACE_API_KEY` / `HF_TOKEN` | токен Hugging Face (Inference API). Owner-only AI для эксплуатации платформы. |
| `HF_OPS_QUICK_MODEL` / `HF_OPS_DEEP_MODEL` | модели для быстрых / глубоких операций AI |
| `OPENAI_API_KEY` | ключ OpenAI для AI-смет |
| `OPENAI_ESTIMATE_MODEL` / `HF_ESTIMATE_MODEL` | модели для генерации смет |
| `VITE_API_BASE` | базовый URL API, если фронт и бэк на разных доменах. Обычно пусто. |

---

## Шпаргалка по командам

```bash
docker compose up --build          # собрать и запустить
docker compose up --build -d       # то же, в фоне
docker compose logs -f app         # логи приложения
docker compose down                # остановить (данные БД сохранятся)
docker compose down -v             # остановить и УДАЛИТЬ данные БД
```

**Локальный вход для теста:** `admin` / `admin123` (работает, пока `ALLOW_FALLBACK_ADMIN` ≠ `false`).

**Перед боевым запуском обязательно:** `ALLOW_INSECURE_LOGIN=false` (или убрать), `ALLOW_FALLBACK_ADMIN=false`, задать `SESSION_SECRET`, поднять HTTPS.