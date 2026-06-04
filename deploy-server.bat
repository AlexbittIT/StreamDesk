@echo off
chcp 65001 >nul
cd /d "%~dp0"
title StreamDesk Deploy

echo.
echo ==========================================
echo   StreamDesk - Deploy to server
echo ==========================================
echo.
echo Folder: %CD%
echo.

if not exist "package.json" (
    echo [ERROR] Run this file from project root StreamDesk.
    echo Current folder: %CD%
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

if not exist "deploy.config" (
    if exist "deploy.config.example" (
        echo Creating deploy.config from example...
        copy /Y deploy.config.example deploy.config >nul
        echo Done. Edit deploy.config if needed.
        echo.
    ) else (
        echo [ERROR] deploy.config not found.
        echo Copy deploy.config.example to deploy.config or create deploy.config with SERVER_USER, SERVER_IP, SERVER_PORT, SERVER_PATH.
        echo.
        pause
        exit /b 1
    )
)

echo deploy.config found.
echo.

set "SSH_PASSWORD="
set /p SSH_PASSWORD="Enter server SSH password and press Enter: "
if "%SSH_PASSWORD%"=="" (
    echo No password entered. Run again and enter password.
    echo.
    pause
    exit /b 1
)

echo.
echo Running full deploy...
echo

node deploy-full.mjs

if %errorlevel% neq 0 (
    echo.
    echo Deploy failed. See messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo Press any key to close...
pause >nul
