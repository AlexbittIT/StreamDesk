# StreamDesk

Веб-приложение для управления стриминговой студией: календарь событий, учёт оборудования, таск-менеджер с канбан-досками, видеопроекты, интеграция с YouGile, мониторинг и отчёты.

## Стек

- **Frontend:** React 18, TypeScript, Vite, TanStack Query, Wouter, Radix UI / shadcn, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **БД:** PostgreSQL, Drizzle ORM
- **Дополнительно:** WebSocket, сессии (express-session), Passport (auth)

## Требования

- Node.js 18+
- PostgreSQL
- npm

## Установка и запуск

```bash
# Клонирование
git clone https://github.com/AlexbittIT/StreamDesk.git
cd streamdesk

# Зависимости
npm install

# Настройка окружения
cp .env.example .env
# Отредактируйте .env: DATABASE_URL, при необходимости PORT и др.

# Применение схемы БД (опционально)
npm run db:push

# Запуск в режиме разработки
npm run dev
```

Приложение будет доступно по адресу **http://localhost:5000**.

Учётные данные по умолчанию (после первого запуска с сидом): **admin** / **admin123**.

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Режим разработки (Vite + Express) |
| `npm run build` | Сборка фронтенда и бэкенда для продакшена |
| `npm start` | Запуск собранного приложения |
| `npm run check` | Проверка типов TypeScript |
| `npm run db:push` | Применение изменений схемы к БД (Drizzle) |

## Структура проекта

```
├── client/          # React-приложение (Vite)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── lib/
├── server/          # Express API, WebSocket, БД
│   ├── index.ts
│   ├── routes.ts
│   ├── database.ts
│   └── ...
├── shared/          # Общие типы и схемы (Drizzle, Zod)
│   └── schema.ts
├── .env.example
└── package.json
```

## Основной функционал

- **Календарь** — события, участники, локации
- **Оборудование** — инвентарь, статусы, штрихкоды/QR
- **Задачи** — канбан по статусам, подзадачи, теги, интеграция с YouGile
- **Проекты** — видеопроекты, колонки, статистика по задачам
- **Мониторинг** — системы, стримы, дашборд
- **Настройки** — пользователи, роли, интеграции (YouGile и др.)

## Лицензия

MIT
