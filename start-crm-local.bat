@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title StreamDesk CRM - local launcher

set "LOG_FILE=%~dp0start-crm-local.log"
echo ==== %date% %time% ==== > "%LOG_FILE%"

call :log ==========================================
call :log StreamDesk CRM - local launcher
call :log ==========================================
call :log.

call :log [1/7] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    call :fail "Node.js not found. Install it from https://nodejs.org/"
)

call :log [2/7] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
    call :fail "npm not found. Reinstall Node.js with npm."
)

call :log [3/7] Preparing .env...
if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
        call :log Created .env from .env.example
    ) else (
        (
            echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
            echo PORT=5000
            echo NODE_ENV=development
        ) > ".env"
        call :log Created default .env
    )
)

call :log [4/7] Checking dependencies...
if not exist "node_modules" (
    call :log Running npm install...
    call npm install >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :fail "npm install failed. See start-crm-local.log"
    )
) else (
    call :log node_modules already exists
)

call :log [5/7] Preparing database...
if exist "scripts\create-db-if-missing.js" (
    node scripts\create-db-if-missing.js >> "%LOG_FILE%" 2>&1
)

call npm run db:push >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    call :log WARNING: db:push failed. CRM may start with partial functionality.
)

call :log [6/7] Releasing old Node process on port 5000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
    tasklist /FI "PID eq %%P" | findstr /I "node.exe" >nul 2>&1
    if not errorlevel 1 (
        taskkill /PID %%P /F >nul 2>&1
        call :log Killed old node process PID %%P
    )
)

call :log [7/7] Starting CRM...
start "StreamDesk CRM Dev Server" cmd /k "cd /d ""%~dp0"" && chcp 65001 >nul && set NODE_ENV=development && npx cross-env NODE_ENV=development tsx backend/index.ts"

call :log Waiting for server startup...
timeout /t 6 /nobreak >nul

call :log Opening browser: http://localhost:5000
start "" "http://localhost:5000"

call :log.
call :log Done.
call :log Log file: %LOG_FILE%
call :log If something does not work, open start-crm-local.log
call :log.
pause
exit /b 0

:log
echo %*
>> "%LOG_FILE%" echo %*
exit /b 0

:fail
echo.
echo [ERROR] %~1
echo [ERROR] %~1>> "%LOG_FILE%"
echo.
echo Open log: %LOG_FILE%
echo.
pause
exit /b 1
