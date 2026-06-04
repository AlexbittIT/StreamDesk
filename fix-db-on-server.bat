@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Fix DB on server (db:push)

echo.
echo Apply database schema on server (create users table, etc.)
echo Uses deploy.config. You will be asked for SSH password.
echo.

if not exist "deploy.config" (
    echo [ERROR] deploy.config not found.
    pause
    exit /b 1
)

set "SSH_PASSWORD="
set /p SSH_PASSWORD="Enter server SSH password: "
if "%SSH_PASSWORD%"=="" (
    echo No password.
    pause
    exit /b 1
)

node scripts/run-db-push-on-server.mjs
if %errorlevel% neq 0 (
    echo.
    echo Failed. Check that .env on server has correct DATABASE_URL.
    pause
    exit /b 1
)
echo.
pause
