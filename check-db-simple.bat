@echo off
chcp 65001 >nul
title StreamDesk - Проверка подключения к БД
echo ========================================
echo   Проверка подключения к PostgreSQL
echo ========================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден!
    echo Пожалуйста, установите Node.js
    pause
    exit /b 1
)

:: Проверка .env файла
if not exist ".env" (
    echo ❌ Файл .env не найден!
    echo Создайте файл .env с настройками базы данных
    echo.
    pause
    exit /b 1
)

echo ✅ Файл .env найден
echo.

:: Проверка наличия необходимых пакетов
if not exist "node_modules\postgres" (
    echo ⚠️  Пакет postgres не установлен. Установка...
    echo.
    call npm install postgres --save
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке postgres
        pause
        exit /b 1
    )
    echo.
)

if not exist "node_modules\dotenv" (
    echo ⚠️  Пакет dotenv не установлен. Установка...
    echo.
    call npm install dotenv --save
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке dotenv
        pause
        exit /b 1
    )
    echo.
)

echo Запуск проверки подключения...
echo.

:: Запуск проверки
call node test-db.mjs

echo.
pause

