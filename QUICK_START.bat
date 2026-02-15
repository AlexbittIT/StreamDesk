@echo off
chcp 65001 >nul
title StreamDesk - Быстрый старт
echo ========================================
echo   StreamDesk - Быстрая установка
echo ========================================
echo.
echo Этот скрипт:
echo 1. Установит все зависимости (включая dotenv)
echo 2. Создаст файл .env
echo 3. Запустит сервер
echo.
echo ⚠️  ВАЖНО: После первого запуска откройте файл .env
echo    и укажите правильные данные для PostgreSQL!
echo.
pause
echo.

:: Установка зависимостей
echo [1/3] Установка зависимостей...
if not exist "node_modules" (
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке
        pause
        exit /b 1
    )
) else (
    echo ✅ Зависимости уже установлены
)
echo.

:: Создание .env файла
echo [2/3] Проверка файла .env...
if not exist ".env" (
    echo Создаю .env файл...
    (
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
        echo PORT=5000
        echo NODE_ENV=development
    ) > .env
    echo ✅ Файл .env создан
    echo.
    echo ⚠️  Откройте файл .env и укажите правильные данные PostgreSQL!
    echo.
    timeout /t 5 /nobreak >nul
) else (
    echo ✅ Файл .env существует
)
echo.

:: Установка dotenv
echo [3/3] Проверка dotenv...
if not exist "node_modules\dotenv" (
    echo Установка dotenv...
    call npm install dotenv --save
)
echo ✅ Готово к запуску
echo.
echo ========================================
echo   Запуск сервера...
echo ========================================
echo.
echo Откройте http://localhost:5000 после запуска
echo.
timeout /t 2 /nobreak >nul

:: Запуск
set NODE_ENV=development
call npx tsx server/index.ts

pause

