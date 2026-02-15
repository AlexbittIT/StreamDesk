@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title StreamDesk - Запуск с доменом
color 0A
echo ========================================
echo   StreamDesk - Запуск с доменом
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

:: Проверка .env файла
if not exist ".env" (
    echo ⚠️  Файл .env не найден!
    echo Создаю файл .env с настройками по умолчанию...
    echo.
    (
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
        echo PORT=5000
        echo NODE_ENV=development
    ) > .env
    echo ✅ Файл .env создан
    echo.
    echo ⚠️  ВАЖНО: Откройте файл .env и укажите правильные данные для PostgreSQL!
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

:: Получение локального IP адреса
echo Получение локального IP адреса...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    set LOCAL_IP=!LOCAL_IP:~1!
    goto :ip_found
)
:ip_found

echo.
echo ========================================
echo   Информация о доступе
echo ========================================
echo.
echo ✅ Локальный доступ:
echo    http://localhost:5000
echo.
if defined LOCAL_IP (
    echo ✅ Доступ в локальной сети:
    echo    http://%LOCAL_IP%:5000
    echo.
)
echo ⚠️  Для доступа по домену:
echo    1. Откройте порт 5000 в роутере (Port Forwarding)
echo    2. Настройте DNS A-запись вашего домена на ваш внешний IP
echo    3. Или используйте ngrok для быстрого доступа (см. инструкцию ниже)
echo.
echo ========================================
echo.

:: Проверка наличия ngrok
where ngrok >nul 2>&1
if %errorlevel% equ 0 (
    echo Обнаружен ngrok. Хотите запустить туннель? (Y/N)
    set /p USE_NGROK=
    if /i "%USE_NGROK%"=="Y" (
        echo.
        echo Запуск ngrok туннеля...
        echo Откройте новое окно терминала для ngrok
        start cmd /k "ngrok http 5000"
        echo.
        echo ✅ Ngrok запущен в отдельном окне
        echo Проверьте URL в окне ngrok
        echo.
        timeout /t 3 /nobreak >nul
    )
) else (
    echo.
    echo 💡 Совет: Установите ngrok для быстрого доступа по домену
    echo    Скачать: https://ngrok.com/download
    echo    После установки запустите: ngrok http 5000
    echo.
)

echo ✅ Все проверки пройдены
echo.
echo Запуск сервера...
echo.
echo ========================================
echo   Сервер запускается...
echo ========================================
echo.
echo Для остановки нажмите Ctrl+C
echo.
echo ========================================
echo.

:: Установка переменной окружения
set NODE_ENV=development

:: Запуск сервера
call npx tsx server/index.ts

:: Если сервер остановился
if %errorlevel% neq 0 (
    echo.
    echo ❌ Сервер остановлен с ошибкой
    echo.
    pause
)

