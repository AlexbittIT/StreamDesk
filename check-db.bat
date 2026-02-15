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
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    echo.
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

:: Проверка DATABASE_URL
findstr /C:"DATABASE_URL=" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ DATABASE_URL не найден в .env файле!
    echo.
    pause
    exit /b 1
)

echo ✅ Файл .env найден
echo.
echo Запуск проверки подключения...
echo.

:: Создание временного скрипта для проверки
echo import postgres from "postgres"; > check-db-temp.js
echo import "dotenv/config"; >> check-db-temp.js
echo. >> check-db-temp.js
echo const connectionString = process.env.DATABASE_URL; >> check-db-temp.js
echo if (!connectionString) { >> check-db-temp.js
echo   console.log("❌ DATABASE_URL не установлен в .env"); >> check-db-temp.js
echo   process.exit(1); >> check-db-temp.js
echo } >> check-db-temp.js
echo. >> check-db-temp.js
echo console.log("Попытка подключения к базе данных..."); >> check-db-temp.js
echo const sql = postgres(connectionString); >> check-db-temp.js
echo sql`SELECT 1 as test`.then((result) =^> { >> check-db-temp.js
echo   console.log("✅ Подключение успешно!"); >> check-db-temp.js
echo   console.log("   Результат запроса:", result); >> check-db-temp.js
echo   sql.end(); >> check-db-temp.js
echo   process.exit(0); >> check-db-temp.js
echo }).catch((error) =^> { >> check-db-temp.js
echo   console.log("❌ Ошибка подключения:"); >> check-db-temp.js
echo   console.log("   ", error.message); >> check-db-temp.js
echo   console.log(""); >> check-db-temp.js
echo   console.log("Проверьте:"); >> check-db-temp.js
echo   console.log("   1. PostgreSQL запущен (services.msc)"); >> check-db-temp.js
echo   console.log("   2. База данных создана"); >> check-db-temp.js
echo   console.log("   3. Пароль в .env правильный"); >> check-db-temp.js
echo   sql.end(); >> check-db-temp.js
echo   process.exit(1); >> check-db-temp.js
echo }); >> check-db-temp.js

:: Проверка наличия postgres пакета
if not exist "node_modules\postgres" (
    echo ⚠️  Пакет postgres не установлен. Установка...
    echo.
    call npm install postgres
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке postgres
        del check-db-temp.js 2>nul
        pause
        exit /b 1
    )
)

:: Запуск проверки
call npx tsx check-db-temp.js

:: Удаление временного файла
del check-db-temp.js 2>nul

echo.
pause

