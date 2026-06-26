# StreamDesk Backend (Java / Spring Boot)

Каркас миграции бэкенда StreamDesk с TypeScript/Express на Java/Spring Boot.
Работает с той же базой PostgreSQL, что и текущий TS-бэкенд (`backend/`).

## Что уже есть

- `pom.xml` — зависимости: Web, Data JPA, Security, Validation, PostgreSQL, Lombok
- `StreamDeskApplication.java` — точка входа (аналог `backend/index.ts`)
- `application.yml` — конфиг подключения к БД и сессий
- `config/SecurityConfig.java` — BCrypt (cost=12, как в `backend/auth.ts`) + заготовка security
- Эталонный модуль **Equipment** (Entity → Repository → Controller) — образец для остальных
- Модуль **User** (Entity + Repository) — основа для авторизации

## Что нужно установить

1. **JDK 21** — https://adoptium.net/ (Temurin 21). Проверка: `java -version`
2. **Maven** — https://maven.apache.org/download.cgi (или используй встроенный в IntelliJ IDEA)

> Maven Wrapper (`mvnw`) тут не добавлен, т.к. он требует бинарных файлов.
> Проще открыть папку в IntelliJ IDEA — она сама подтянет Maven и зависимости.

## Запуск

Перед запуском задай подключение к БД (JDBC-формат отличается от `postgresql://...`):

```bash
# Windows PowerShell
$env:JDBC_DATABASE_URL = "jdbc:postgresql://localhost:5432/streamdesk"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "postgres"

mvn spring-boot:run
```

Приложение поднимется на **http://localhost:8080** (порт 8080, чтобы не конфликтовать
с TS-бэкендом на 5000 — можно запускать оба одновременно во время миграции).

Проверка: `GET http://localhost:8080/api/equipment`

## Соответствие текущему коду

| TS (`backend/`)            | Java (`backend-java/`)              |
|----------------------------|-------------------------------------|
| `index.ts`                 | `StreamDeskApplication.java`        |
| `shared/schema.ts`         | классы `@Entity`                    |
| `IStorage` / `database.ts` | интерфейсы `JpaRepository`          |
| `routes.ts`                | классы `@RestController`            |
| `auth.ts` (bcrypt)         | `SecurityConfig` + `PasswordEncoder`|
| `.env`                     | `application.yml` + env-переменные  |

## Дальнейшие шаги

1. Перенести остальные сущности из `shared/schema.ts` (всего ~40 таблиц)
2. Подключить реальную авторизацию по сессии в `SecurityConfig` (шаг 4 плана)
3. Переносить домены по одному по образцу Equipment (Events, Tasks, Streams, ...)
4. В конце — интеграции (Telegram, YouGile, vMix)