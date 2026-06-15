# syntax=docker/dockerfile:1

###############################################
# Этап 1: builder — установка зависимостей и сборка
###############################################
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Сначала только манифесты — кешируется слой с npm ci
COPY package.json package-lock.json* ./
RUN npm ci

# Копируем исходники и собираем (frontend -> dist/public, backend -> dist/index.js)
COPY . .
RUN npm run build

###############################################
# Этап 2: production — лёгкий образ для запуска
###############################################
FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Готовые node_modules из builder (содержат и drizzle-kit для db:push)
COPY --from=builder /app/node_modules ./node_modules
# Результат сборки
COPY --from=builder /app/dist ./dist
# Файлы, нужные для применения схемы БД (npm run db:push)
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000

# При старте: накатываем схему на БД, затем запускаем сервер
CMD ["sh", "-c", "npm run db:push && npm start"]