# Архитектура и структура проекта StreamDesk

Документ описывает устройство проекта: структуру каталогов, технологический стек,
назначение модулей и зависимости между ними. Он согласован с `README.md`.

StreamDesk — это веб-приложение для команд, которые занимаются мероприятиями и стримами.
В одном месте собрано: склад оборудования, задачи (канбан), проекты, сметы, схемы
подключения и мониторинг компьютеров. В системе одновременно может работать несколько
компаний, при этом данные разных компаний не пересекаются (мультиарендность).

Приложение состоит из трёх основных частей: серверной на Java/Spring Boot
(`backend-java/`), клиентской на React (`frontend/`) и общего кода со схемой данных
фронтенда (`shared/`).

> Бэкенд переведён с Node/Express (TypeScript) на Java/Spring Boot. Каталог `backend/`
> (Node) удалён, актуальный серверный код находится в `backend-java/`. SQL-миграции и
> схема таблиц в БД при этом сохранены.

## 1. Структура каталогов

Основные каталоги и их содержимое (примерно 2 уровня вложенности):

```text
StreamDesk/
├── backend-java/          серверная часть на Java / Spring Boot
│   ├── pom.xml            зависимости и сборка Maven
│   ├── mvnw / mvnw.cmd    Maven Wrapper (запуск без локального Maven)
│   ├── src/main/java/com/streamdesk/
│   │   ├── StreamDeskApplication.java  точка входа Spring Boot
│   │   ├── config/        безопасность, CORS, health, обработка ошибок
│   │   ├── auth/          сессии, фильтр аутентификации, BCrypt
│   │   ├── user/          пользователи и их права
│   │   ├── company/       компании, участники, инвайт-ссылки
│   │   ├── equipment/     склад оборудования (фото, поиск)
│   │   ├── equipmentports/ порты оборудования и подбор разъёмов (Задача 2)
│   │   ├── connectionschema/  схемы подключения, AI-генерация, валидация связей
│   │   ├── task/          задачи, комментарии, история (канбан)
│   │   ├── project/       проекты и колонки
│   │   ├── reservation/ checkout/  бронирование и выдача оборудования
│   │   ├── computer/ agent/ system/  мониторинг машин и агенты
│   │   ├── stream/ vmix/ obs/ show/  стримы и эфирные сервисы
│   │   ├── chat/ ai/      чат с ИИ и клиент DeepSeek
│   │   ├── transcription/ транскрипция аудио и генерация документов
│   │   ├── notification/  уведомления
│   │   ├── telegram/      телеграм-бот и шлюз уведомлений
│   │   ├── yougile/       синхронизация с YouGile
│   │   ├── analytics/ dashboard/ onboarding/  аналитика, дашборд, онбординг
│   │   └── room/ location/ label/ role/ event/ platform/ production/ repository/ terminal/  прочие домены
│   └── src/main/resources/
│       ├── application.yml         конфигурация (БД, сессии, AI, CORS)
│       ├── connector_types.json    справочник типов разъёмов
│       └── fonts/                  шрифты для генерации PDF (DejaVuSans)
│
├── frontend/              клиентская часть на React (сборка Vite)
│   ├── index.html         основной HTML-шаблон
│   ├── public/            иконки, manifest, service worker (для PWA)
│   └── src/
│       ├── main.tsx       точка входа React
│       ├── App.tsx        маршруты и провайдеры
│       ├── pages/         страницы приложения
│       ├── components/    компоненты (ui, dashboard, forms, layout, connection-schemas, equipment и др.)
│       ├── hooks/         пользовательские хуки (toast, i18n, mobile и др.)
│       ├── lib/           вспомогательные функции (queryClient, auth, i18n и др.)
│       └── contexts/      контекст авторизации
│
├── shared/
│   └── schema.ts          типы данных для фронтенда (общие схемы/типы)
│
├── docs/                  документация (в основном на русском), openapi.yaml, справочники разъёмов
├── scripts/               агенты мониторинга (.ps1, .sh)
├── connection-schema-icons/  иконки и токены для схем подключения
│
├── create_connection_schemas_tables.sql  SQL-миграция: таблицы схем подключения
├── create_equipment_ports_tables.sql     SQL-миграция: порты оборудования (Задача 2)
│
├── Dockerfile            трёхэтапная сборка одного образа (фронт + Java-бэк)
├── docker-compose.yml    PostgreSQL + приложение для локального запуска
├── package.json          зависимости и команды фронтенда
├── vite.config.ts        настройка сборки фронтенда
└── README.md             описание проекта
```

В корне проекта также находятся `.bat`-файлы для запуска агентов под Windows
(`agent-computer.bat`, `agent-server.bat`, `agent-vmix.bat`).

## 2. Технологический стек и версии

Версии приведены по файлам `package.json` (фронт) и `backend-java/pom.xml` (бэк).

### 2.1. Клиентская часть (Frontend)

- React 18 и TypeScript — основа интерфейса;
- Vite — сборка и dev-сервер;
- Wouter — маршрутизация на стороне клиента;
- TanStack React Query — запросы к серверу и кеширование данных;
- Tailwind CSS и компоненты на Radix UI — оформление и UI-элементы;
- Lucide React — иконки; React Hook Form — формы;
- Recharts — графики мониторинга и статистики;
- Konva / react-konva — холст для схем подключения;
- jsPDF, PDFKit, docx, html2canvas — экспорт документов (сметы, схемы);
- jsbarcode и html5-qrcode — генерация и сканирование штрихкодов.

### 2.2. Серверная часть (Backend)

- Java 21 — рантайм;
- Spring Boot 3.4.1 — Spring Web, Spring Security, Spring Data JPA, Validation;
- Hibernate ORM — работа с PostgreSQL (в т.ч. jsonb);
- Maven — сборка (через `./mvnw`, локальный Maven не обязателен);
- сессии и cookie-аутентификация (кука `streamdesk.sid`, BCrypt cost=12);
- Apache POI и Apache PDFBox — генерация документов (Excel, PDF);
- DeepSeek (OpenAI-совместимый API) — AI-генерация схем и подбор портов.

### 2.3. База данных

- PostgreSQL — основная база данных;
- JPA-сущности (`@Entity`) описывают существующую схему таблиц;
- `ddl-auto=validate` (по умолчанию): Hibernate не меняет схему. Для свежей dev-БД
  можно задать `SPRING_JPA_HIBERNATE_DDL_AUTO=update`, тогда Hibernate создаст таблицы
  из сущностей;
- SQL-миграции в корне: `create_connection_schemas_tables.sql`,
  `create_equipment_ports_tables.sql` (порты оборудования, Задача 2).

### 2.4. Сборка и развёртывание

- Maven — сборка серверного jar (`./mvnw package`);
- Vite — сборка статики фронтенда в `dist/public`;
- Docker и docker-compose — контейнеризация и развёртывание (один образ отдаёт
  и SPA, и `/api`);
- production-образ собирается из `Dockerfile` (фронт + Java-бэк, рантайм — только JRE).

### 2.5. Команды запуска

| Команда | Назначение |
|---------|-----------|
| `docker compose up --build` | поднять PostgreSQL и приложение целиком |
| `cd backend-java && ./mvnw spring-boot:run` | запуск бэкенда (порт 8080) |
| `cd backend-java && ./mvnw test` | тесты бэкенда |
| `cd backend-java && ./mvnw package` | сборка серверного jar |
| `npm run dev` | dev-сервер фронтенда (Vite, порт 5173) |
| `npm run build` | сборка фронтенда в `dist/public` |
| `npm run check` | проверка типов TypeScript (tsc) |

## 3. Назначение модулей

### 3.1. Серверная часть (`backend-java/`)

Код организован по доменам — каждый каталог обычно содержит сущность (`@Entity`),
репозиторий (`JpaRepository`), сервис и контроллер (`@RestController`).

- **StreamDeskApplication.java** — точка входа Spring Boot (аналог прежнего `index.ts`).
- **config/** — `SecurityConfig` (BCrypt + правила доступа), `WebConfig` (CORS, отдача
  SPA), `HealthController` (`/api/health` без авторизации), `GlobalExceptionHandler`
  и `ApiException` (единая обработка ошибок).
- **auth/** — аутентификация по сессии: `SessionAuthenticationFilter`, `PasswordService`
  (BCrypt), `AuthController`, текущий пользователь (`AuthenticatedUser`).
- **user/** — пользователи, их права и CRUD.
- **company/** — компании, участники (`CompanyMember`) и инвайт-ссылки (`CompanyInvite`);
  обеспечивает изоляцию данных между компаниями.
- **equipment/** — склад оборудования: карточки, фото (`EquipmentPhotoService`), поиск.
- **equipmentports/** — порты оборудования и подбор разъёмов (Задача 2): `PortLookupService`,
  кэш портов по модели, очередь несопоставленных терминов (`UnmappedTerm`).
- **connectionschema/** — схемы подключения: компоненты схемы, AI-генерация
  (`AiSchemaService`) и валидация связей (`ConnectionValidator`, `ConnectorTypes`).
- **task/** — задачи канбана: карточки, комментарии, история.
- **project/** — проекты и их колонки.
- **reservation/ checkout/** — бронирование и выдача оборудования.
- **computer/ agent/ system/** — мониторинг компьютеров: приём состояния от агентов
  (`AgentController`), сетевые проверки (`NetworkService`), статусы систем.
- **stream/ vmix/ obs/ show/** — стримы, интеграции с vMix и OBS, эфирные сценарии (OTIS).
- **chat/ ai/** — чат с ИИ и клиент DeepSeek (`DeepSeekClient`).
- **transcription/** — транскрипция аудио (`WhisperXClient`) и генерация документов
  (`DocumentGenerator`, PDF/DOCX).
- **notification/** — уведомления.
- **telegram/** — телеграм-бот (`TelegramBotClient`) и отправка уведомлений.
- **yougile/** — синхронизация задач и досок с внешним сервисом YouGile.
- **analytics/ dashboard/ onboarding/** — аналитика событий, виджеты дашборда, онбординг.
- **room/ location/ label/ role/ event/ platform/ production/ repository/ terminal/** —
  прочие домены: помещения, локации, печать наклеек, роли, мероприятия, платформа,
  продакшен, репозиторий кода, доступ к вкладке «Терминал».
- **resources/application.yml** — конфигурация: подключение к БД, сессии, CORS, fallback-админ
  и AI (DeepSeek). Значения берутся из переменных окружения.

### 3.2. Общий код (`shared/`)

- **schema.ts** — типы данных для фронтенда (используется клиентом). Источник истины
  для схемы БД на сервере — JPA-сущности в `backend-java/`.

### 3.3. Клиентская часть (`frontend/src/`)

- **main.tsx / App.tsx** — запуск React и маршрутизация. Приватные страницы обёрнуты в
  `ProtectedRoute`, который не пускает на них без авторизации.
- **pages/** — экраны приложения: вход, онбординг, дашборд, склад, компьютеры, задачи,
  проекты, сметы, схемы подключения, мониторинг, стримы, настройки и другие.
- **components/ui/** — базовые элементы интерфейса на Radix UI (кнопки, диалоги, таблицы и т.д.).
- **components/dashboard/** — виджеты главной страницы (статусы оборудования и систем,
  быстрые действия, календарь, статистика).
- **components/forms/** — формы создания и редактирования (оборудование, событие, система).
- **components/layout/** — каркас интерфейса: шапка, боковое меню, футер, нижнее меню для мобильных.
- **components/connection-schemas/** — холст схем подключения на Konva и диалоги к нему.
- **components/equipment/** — генератор штрихкодов, сканер и загрузка фотографий.
- **hooks/** — пользовательские хуки: `use-toast`, `use-i18n`, `use-mobile` и другие.
- **lib/** — вспомогательные функции: `queryClient` (настройка React Query), `auth`,
  `i18n`, работа со штрихкодами и правами доступа к складу.
- **contexts/auth-context.tsx** — хранит данные текущего пользователя по всему приложению.

### 3.4. Скрипты и агенты (`scripts/`)

- **streamdesk-agent.ps1** и **streamdesk-agent-linux.sh** — программы-агенты, которые
  устанавливаются на компьютеры и отправляют на сервер их состояние: имя хоста, IP,
  загрузку CPU, память, диск, GPU и список процессов. Каждый агент привязан к компании.

### 3.5. Инфраструктура и конфигурация

- **Dockerfile** — трёхэтапная сборка одного образа: (1) сборка фронта (Vite → `dist/public`),
  (2) сборка Java-jar (Maven), (3) лёгкий рантайм только с JRE. Один процесс отдаёт и SPA
  (из `/app/public`), и REST API на порту 8080. Готовность проверяется через `/api/health`.
- **docker-compose.yml** — поднимает PostgreSQL 16 и приложение, пробрасывает порт 8080,
  база ждёт готовности через healthcheck. Загруженные файлы хранятся в volume `uploads`,
  данные БД — в `pgdata`.
- **vite.config.ts, tailwind.config.ts, tsconfig.json** — настройки сборки фронтенда,
  стилей и TypeScript. **application.yml** (в `backend-java/`) — настройки сервера.

## 4. Зависимости между модулями

### 4.1. Общий поток данных

```text
Браузер (React)
   │  запросы /api/... (cookie-сессия)
   ▼
Сервер (backend-java, Spring Boot)
   │
   ├── база данных (Spring Data JPA / Hibernate) → PostgreSQL
   ├── YouGile (пакет yougile)
   ├── телеграм / WhisperX / DeepSeek (пакеты telegram, transcription, ai)
   └── агенты на компьютерах отправляют сюда своё состояние
```

### 4.2. Связи модулей

- Клиентская часть (`App.tsx`) использует страницы, страницы — компоненты, а данные
  загружаются через `lib/queryClient` (React Query) по адресам `/api/...`.
- Авторизация — по cookie-сессии (`streamdesk.sid`); фронт логинится без изменений,
  так как имя куки сохранено при переходе на Java.
- На сервере `StreamDeskApplication` поднимает Spring Boot; контроллеры (`@RestController`)
  обрабатывают запросы, сервисы — бизнес-логику, репозитории (`JpaRepository`) — доступ к БД.
- `SecurityConfig` задаёт правила доступа, BCrypt и CORS; `/api/health` открыт без авторизации.
- AI-эндпоинты (схемы подключения, подбор портов) обращаются к DeepSeek через `DeepSeekClient`;
  без ключа `DEEPSEEK_API_KEY` они возвращают 503.
- Пакет `yougile` синхронизирует задачи и доски из внешнего сервиса в базу.
- Агенты из `scripts/` отправляют состояние на сервер (приём — в пакете `agent`).
- Docker собирает фронт и бэк в один образ, поднимает PostgreSQL; на свежей БД с
  `ddl-auto=update` Hibernate создаёт таблицы из сущностей.

### 4.3. Переменные окружения

Конфигурацию Spring Boot читает из переменных окружения (или `.env` для docker compose).
Секреты нельзя коммитить в репозиторий. Без необязательных сервисов приложение
продолжает работать в базовом режиме.

| Сервис | Где используется | Переменные окружения |
|--------|------------------|----------------------|
| PostgreSQL | `application.yml`, JPA | `JDBC_DATABASE_URL` (или `SPRING_DATASOURCE_*`), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Схема БД | Hibernate | `SPRING_JPA_HIBERNATE_DDL_AUTO` (`validate` / `update`) |
| Порт бэкенда | `application.yml` | `SERVER_PORT` (по умолчанию 8080) |
| AI (DeepSeek) | пакеты `ai`, `connectionschema`, `equipmentports` | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` |
| Fallback-админ | авторизация | `ALLOW_FALLBACK_ADMIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` |
| YouGile | пакет `yougile` | `YOUGILE_API_KEY`, `YOUGILE_COMPANY_ID` |
| Telegram | пакет `telegram` | токен бота в `.env` |
| Фронт (dev) | Vite | `VITE_API_BASE` (базовый URL API) |

## 5. Запуск

Нужны: **JDK 21**, **Maven** (или `./mvnw`), **Node 20+**, **PostgreSQL** (или Docker).

### 5.1. Вариант A — Docker Compose (быстрее всего)

Один образ собирает фронт (Vite) и Java-бэк и отдаёт SPA + `/api` на порту 8080.

```bash
# .env с POSTGRES_*, DEEPSEEK_API_KEY и (для свежей БД) SPRING_JPA_HIBERNATE_DDL_AUTO=update
docker compose up --build
```

Откроется на `http://localhost:8080`. На свежей БД с `ddl-auto=update` Hibernate сам
создаст таблицы из сущностей. Для боевой БД используйте `validate` и применяйте
SQL-миграции вручную.

### 5.2. Вариант B — вручную (бэк и фронт отдельно)

```bash
# 1. Поднять PostgreSQL и применить миграции (если ddl-auto=validate)
psql "$JDBC_DATABASE_URL" -f create_connection_schemas_tables.sql
psql "$JDBC_DATABASE_URL" -f create_equipment_ports_tables.sql   # порты, Задача 2

# 2. Бэкенд (Java/Spring, порт 8080)
cd backend-java
DEEPSEEK_API_KEY=sk-... ./mvnw spring-boot:run

# 3. Фронтенд (Vite, порт 5173) — в другом терминале
npm install
npm run dev
```

Фронт на `http://localhost:5173`, обращается к бэку по `VITE_API_BASE`.

### 5.3. Production-образ

```bash
docker build -t streamdesk .
```

На рабочей БД держите `ddl-auto=validate`, применяйте только проверенные SQL-миграции,
задайте секреты окружения (`DEEPSEEK_API_KEY`, доступ к БД, `ALLOW_FALLBACK_ADMIN=false`),
запустите контейнер и проверьте `/api/health`.
