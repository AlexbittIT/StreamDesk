@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Деплой StreamDesk на сервер

echo.
echo ==========================================
echo   Деплой StreamDesk на сервер
echo ==========================================
echo.
echo Папка: %CD%
echo.

if not exist "package.json" (
    echo [ОШИБКА] Запустите этот файл из корня проекта StreamDesk.
    echo Сейчас папка: %CD%
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Установите с https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] npm install не удался.
        pause
        exit /b 1
    )
    echo.
)

if not exist "deploy.config" (
    if exist "deploy.config.example" (
        echo Создаю deploy.config из примера...
        copy /Y deploy.config.example deploy.config >nul
        echo Готово. При необходимости отредактируйте deploy.config.
        echo.
    ) else (
        echo [ОШИБКА] Нет deploy.config.
        echo Скопируйте deploy.config.example в deploy.config или создайте deploy.config с SERVER_USER, SERVER_IP, SERVER_PORT, SERVER_PATH.
        echo.
        pause
        exit /b 1
    )
)

echo Файл deploy.config найден.
echo.

set "SSH_PASSWORD="
set /p SSH_PASSWORD="Введите пароль от сервера (SSH) и нажмите Enter: "
if "%SSH_PASSWORD%"=="" (
    echo Пароль не введён. Запустите снова и введите пароль.
    echo.
    pause
    exit /b 1
)

echo.
echo Запуск полного деплоя (один раз настройка + загрузка)...
echo

node deploy-full.mjs

if %errorlevel% neq 0 (
    echo.
    echo Деплой завершился с ошибкой. Смотрите сообщения выше.
    echo.
    pause
    exit /b 1
)

echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
