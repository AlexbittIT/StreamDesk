@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   Остановка всех процессов StreamDesk
echo ========================================
echo.

echo [1/4] Остановка процессов Node.js...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
if errorlevel 1 (
    echo   ✓ Процессы Node.js не найдены
) else (
    echo   Найдены процессы Node.js, останавливаю...
    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST 2^>nul ^| findstr /C:"PID:"') do (
        set PID=%%a
        echo     Остановка процесса с PID: !PID!
        taskkill /F /PID !PID! >nul 2>&1
        if errorlevel 1 (
            echo       ✗ Не удалось остановить процесс !PID!
        ) else (
            echo       ✓ Процесс !PID! остановлен
        )
    )
)

echo.
echo [2/4] Остановка процессов на порту 5000...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000"') do (
    set PID=%%a
    echo   Найден процесс на порту 5000 с PID: !PID!
    taskkill /F /PID !PID! >nul 2>&1
    if errorlevel 1 (
        echo     ✗ Не удалось остановить процесс !PID!
    ) else (
        echo     ✓ Процесс !PID! остановлен
    )
)

echo.
echo [3/4] Остановка процессов на порту 5173...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173"') do (
    set PID=%%a
    echo   Найден процесс на порту 5173 с PID: !PID!
    taskkill /F /PID !PID! >nul 2>&1
    if errorlevel 1 (
        echo     ✗ Не удалось остановить процесс !PID!
    ) else (
        echo     ✓ Процесс !PID! остановлен
    )
)

echo.
echo [4/4] Финальная проверка...
timeout /t 2 /nobreak >nul

REM Проверка Node.js процессов
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
if errorlevel 1 (
    echo   ✓ Все процессы Node.js остановлены
) else (
    echo   ⚠ Некоторые процессы Node.js все еще запущены
    echo     Запустите Диспетчер задач (Ctrl+Shift+Esc) для ручной остановки
)

REM Проверка портов
echo.
echo Проверка портов:
netstat -ano 2>nul | findstr ":5000 :5173 :3000" >nul
if errorlevel 1 (
    echo   ✓ Порты 5000, 5173, 3000 свободны
) else (
    echo   ⚠ Некоторые порты все еще заняты:
    netstat -ano 2>nul | findstr ":5000 :5173 :3000"
)

echo.
echo ========================================
echo   Готово!
echo ========================================
echo.
echo Теперь вы можете запустить dev.bat
echo.
pause
