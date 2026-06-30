от# Подключение к БД (pgAdmin / DBeaver)

БД работает в Docker. Порт **5432** проброшен на хост (`docker-compose.yml` → `"5432:5432"`).

| Поле     | Значение     |
|----------|--------------|
| Host     | `localhost` (или IP сервера) |
| Port     | `5432`       |
| Database | `streamdesk` |
| Username | `postgres`   |
| Password | `postgres`   |

> Порт **5050** — это веб-приложение (браузер), к БД отношения не имеет.

Логин/пароль/имя БД задаются в `docker-compose.yml` → секция `db.environment`.

---

## Когда ставим на сервер (безопасность)

1. **Сменить пароль БД.** Не оставлять `postgres/postgres`. Через `.env` рядом с `docker-compose.yml`:
   ```env
   POSTGRES_PASSWORD=надёжный_пароль
   POSTGRES_USER=postgres
   POSTGRES_DB=streamdesk
   ```
   (compose уже читает эти переменные)

2. **Не пробрасывать 5432 наружу.** Убрать/закомментировать в `docker-compose.yml`:
   ```yaml
   # ports:
   #   - "5432:5432"
   ```
   Бэк ходит в БД внутри docker-сети (`db:5432`) и без проброса. К БД подключаться через **SSH-туннель**:
   ```bash
   ssh -L 5432:localhost:5432 user@сервер
   ```
   потом в pgAdmin Host = `localhost`.

3. **Отключить fallback-админа** — в проде уже `ALLOW_FALLBACK_ADMIN=false` (по умолчанию).
