@echo off
chcp 65001 >nul
title StreamDesk — запуск
cd /d "%~dp0"

echo.
echo ==========================================
echo   StreamDesk — настройка и запуск
echo ==========================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Установите с https://nodejs.org/
    pause
    exit /b 1
)

:: 1. Файл .env
if not exist ".env" (
    echo [1/5] Создаю .env...
    (
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
        echo PORT=5000
        echo NODE_ENV=development
    ) > .env
    echo [OK] Файл .env создан. Если у вас другой пароль PostgreSQL — откройте .env и измените DATABASE_URL.
) else (
    echo [1/5] Файл .env найден.
)
echo.

:: Если в .env заглушка USER:PASSWORD — заменить на postgres:postgres
findstr /C:"USER:PASSWORD" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo [1/5] Подставляю DATABASE_URL (postgres/postgres)...
    node scripts\fix-env-database-url.js 2>nul
)
findstr /C:"DATABASE_URL=postgresql://" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] В .env должен быть DATABASE_URL=postgresql://логин:пароль@localhost:5432/streamdesk
    echo Откройте .env и укажите данные PostgreSQL.
    pause
    exit /b 1
)
echo.

:: 2. Зависимости
echo [2/5] Проверка зависимостей...
if not exist "node_modules\package.json" (
    echo     Устанавливаю npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] npm install не удался.
        pause
        exit /b 1
    )
) else (
    echo     node_modules есть.
)
echo.

:: 3. База данных: создать БД и таблицы
echo [3/5] База данных...
node scripts\create-db-if-missing.js 2>nul
echo     Применяю схему (db:push)...
call npm run db:push 2>nul
if %errorlevel% neq 0 (
    echo     db:push выдал ошибку. Проверьте:
    echo     - PostgreSQL запущен (служба postgresql)
    echo     - В .env верные логин и пароль в DATABASE_URL
    echo.
    echo Продолжаю запуск — если регистрация не работает, исправьте .env и снова запустите этот файл.
) else (
    echo     Схема БД применена.
)
echo.

:: 4. Проверка подключения
echo [4/5] Проверка подключения к БД...
node test-db-connection.js 2>nul
if %errorlevel% neq 0 (
    echo     Подключение к БД не удалось. Регистрация может не работать.
    echo     Убедитесь, что PostgreSQL запущен и DATABASE_URL в .env верный.
) else (
    echo     Подключение к БД OK.
)
echo.

:: 5. Запуск приложения
echo [5/5] Запуск приложения...
echo.
echo Откройте в браузере: http://localhost:5000
echo Остановка: Ctrl+C
echo ==========================================
echo.

set NODE_ENV=development
call npx cross-env NODE_ENV=development npx tsx server/index.ts

if %errorlevel% neq 0 (
    echo.
    echo Сервер завершился с ошибкой.
    pause
)
