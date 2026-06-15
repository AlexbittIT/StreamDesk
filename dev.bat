@echo off
chcp 65001 >nul
title StreamDesk - Development Server
echo ========================================
echo   StreamDesk - Запуск сервера
echo ========================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден!
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Проверка node_modules
if not exist "node_modules" (
    echo ⚠️  Зависимости не установлены
    echo Запускаю установку...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке зависимостей
        pause
        exit /b 1
    )
    echo.
)

:: Проверка .env файла — создаём из .env.example, если нет .env
if not exist ".env" (
    echo ⚠️  Файл .env не найден!
    if exist ".env.example" (
        echo Копирую настройки из .env.example...
        copy /Y .env.example .env >nul
        echo ✅ Файл .env создан из .env.example
    ) else (
        echo Создаю файл .env с настройками по умолчанию...
        (
            echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
            echo PORT=5000
            echo NODE_ENV=development
        ) > .env
        echo ✅ Файл .env создан
    )
    echo.
    echo ⚠️  ВАЖНО: Откройте файл .env и укажите DATABASE_URL для PostgreSQL!
    echo.
    timeout /t 3 /nobreak >nul
)

:: Проверка DATABASE_URL
findstr /C:"DATABASE_URL=" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  DATABASE_URL не найден в .env файле!
    echo Добавьте строку: DATABASE_URL=postgresql://user:password@localhost:5432/database
    echo.
    pause
    exit /b 1
)

echo ✅ Все проверки пройдены
echo.
echo Запуск сервера разработки...
echo Порт берётся из .env (переменная PORT). Адрес будет выведен ниже.
echo.
echo Для остановки нажмите Ctrl+C
echo.
echo ========================================
echo.

:: Проверка и установка dotenv
if not exist "node_modules\dotenv" (
    echo Установка dotenv для загрузки .env файла...
    call npm install dotenv --save
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке dotenv
        pause
        exit /b 1
    )
)

:: Проверка и установка postgres
if not exist "node_modules\postgres" (
    echo Установка postgres для подключения к PostgreSQL...
    call npm install postgres --save
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке postgres
        pause
        exit /b 1
    )
)

:: Установка переменной окружения
set NODE_ENV=development

:: Запуск через tsx (dotenv будет загружен автоматически через import "dotenv/config" в backend/index.ts)
call npx tsx backend/index.ts

:: Если сервер остановился
if %errorlevel% neq 0 (
    echo.
    echo ❌ Сервер остановлен с ошибкой
    echo.
    pause
)
