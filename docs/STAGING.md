# Staging — весь стек одной командой (Docker)

Поднимает полный стек StreamDesk: **PostgreSQL + Java-бэкенд (Spring Boot) + собранный фронт (SPA)**.
Один образ собирает фронт (Vite) и Java-бэк и отдаёт и сайт, и `/api` на порту **8080**.

## Запуск

Нужен только Docker (с Docker Compose). Из корня репозитория:

```bash
docker compose up -d --build
```

Откройте **http://localhost:8080**.

- Схема БД создаётся автоматически (`SPRING_JPA_HIBERNATE_DDL_AUTO=update`).
- Вход в staging: пользователь `admin` / `admin123` (fallback-админ включён) — либо зарегистрируйте аккаунт через UID.

## Проверка готовности (Acceptance: «staging доступен»)

```bash
docker compose ps            # app и db должны быть healthy
curl -fsS http://localhost:8080/api/health   # {"ok":true,"stubMode":false}
```

`app` помечается `healthy` по `HEALTHCHECK`, который опрашивает `/api/health` (даём ~80 c на старт JVM и миграцию схемы).

## Переменные окружения

Compose читает значения из `.env` рядом с `docker-compose.yml` (необязателен — есть дефолты):

```env
# БД (по умолчанию streamdesk/postgres/postgres)
POSTGRES_DB=streamdesk
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# AI: схемы подключения (DeepSeek) и подбор портов. Без ключа стек поднимется,
# но AI-эндпоинты вернут 503 (без молчаливого фолбэка на шаблон).
DEEPSEEK_API_KEY=sk-...
# опционально: HUGGINGFACE_API_KEY / HF_TOKEN

# Для прод-окружения отключите fallback-админа:
# ALLOW_FALLBACK_ADMIN=false
```

## Полезные команды

```bash
docker compose logs -f app     # логи приложения
docker compose down            # остановить
docker compose down -v         # остановить и удалить тома (БД и загрузки)
```

## Что внутри образа

| Этап сборки | Из чего | Результат |
|---|---|---|
| frontend | `node:20` + `vite build` | `dist/public` (SPA) |
| backend | `maven:3.9-eclipse-temurin-21` | `streamdesk-backend-*.jar` |
| runtime | `eclipse-temurin:21-jre` + `curl` | jar + `public/`, отдаёт SPA и `/api` на 8080 |

Node и Maven нужны только на этапах сборки; в финальном образе — только JRE.
