# syntax=docker/dockerfile:1

###############################################
# Этап 1: сборка фронта (Vite -> dist/public).
# Node нужен ТОЛЬКО здесь, на этапе сборки. В финальном образе его нет.
###############################################
FROM node:20-bookworm-slim AS frontend
WORKDIR /src
# Сначала манифесты — слой npm ci кешируется
COPY package.json package-lock.json* ./
RUN npm ci
# Исходники фронта (+ shared, конфиги vite/tailwind/tsconfig)
COPY . .
RUN npx vite build
# Результат: /src/dist/public

###############################################
# Этап 2: сборка Java-jar (Maven)
###############################################
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /src
# Сначала pom — кешируем зависимости отдельным слоем (best-effort)
COPY backend-java/pom.xml ./pom.xml
RUN mvn -q -B dependency:go-offline || true
COPY backend-java/src ./src
RUN mvn -q -B -DskipTests package
# Результат: /src/target/streamdesk-backend-*.jar

###############################################
# Этап 3: рантайм — только JRE (ни Node, ни Maven)
###############################################
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=backend /src/target/*.jar app.jar
# Собранный фронт — Java отдаёт его как SPA вместе с /api
COPY --from=frontend /src/dist/public ./public
EXPOSE 5050
# Один процесс: отдаёт и сайт (из /app/public), и REST API
ENTRYPOINT ["java", "-jar", "app.jar", "--app.spa-dir=/app/public"]
