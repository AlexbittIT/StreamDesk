@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   Проверка занятых портов StreamDesk
echo ========================================
echo.

echo Проверка порта 5000 (Backend сервер)...
netstat -ano 2>nul | findstr ":5000" >nul
if errorlevel 1 (
    echo   ✓ Порт 5000 свободен
) else (
    echo   ✗ Порт 5000 ЗАНЯТ:
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000"') do (
        set PID=%%a
        echo     PID процесса: !PID!
        tasklist /FI "PID eq !PID!" /FO LIST 2>nul | findstr "Имя образа" | findstr /v "INFO:" || echo     Процесс: не найден
    )
)
echo.

echo Проверка порта 5173 (Frontend Vite)...
netstat -ano 2>nul | findstr ":5173" >nul
if errorlevel 1 (
    echo   ✓ Порт 5173 свободен
) else (
    echo   ✗ Порт 5173 ЗАНЯТ:
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173"') do (
        set PID=%%a
        echo     PID процесса: !PID!
        tasklist /FI "PID eq !PID!" /FO LIST 2>nul | findstr "Имя образа" | findstr /v "INFO:" || echo     Процесс: не найден
    )
)
echo.

echo Проверка порта 3000 (Альтернативный)...
netstat -ano 2>nul | findstr ":3000" >nul
if errorlevel 1 (
    echo   ✓ Порт 3000 свободен
) else (
    echo   ✗ Порт 3000 ЗАНЯТ:
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000"') do (
        set PID=%%a
        echo     PID процесса: !PID!
        tasklist /FI "PID eq !PID!" /FO LIST 2>nul | findstr "Имя образа" | findstr /v "INFO:" || echo     Процесс: не найден
    )
)
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Все процессы Node.js:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE 2>nul | find "node.exe"
if errorlevel 1 (
    echo   ✓ Процессы Node.js не найдены
) else (
    echo.
    echo   Для остановки всех процессов Node.js запустите: ОСТАНОВИТЬ_ВСЕ.bat
)
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Все процессы tsx:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
tasklist /FI "IMAGENAME eq tsx.exe" /FO TABLE 2>nul | find "tsx.exe"
if errorlevel 1 (
    echo   ✓ Процессы tsx.exe не найдены
)
echo.

echo ========================================
echo   Для остановки всех процессов запустите:
echo   ОСТАНОВИТЬ_ВСЕ.bat
echo ========================================
echo.
pause
