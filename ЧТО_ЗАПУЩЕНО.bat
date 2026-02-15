@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   Диагностика запущенных процессов
echo ========================================
echo.

echo [1] Проверка порта 5000...
echo.
netstat -ano 2>nul | findstr ":5000" >nul
if errorlevel 1 (
    echo   ✓ Порт 5000 СВОБОДЕН - сервер не запущен
    echo.
    echo   Это нормально, если вы не запускали dev.bat
    echo.
) else (
    echo   ✗ Порт 5000 ЗАНЯТ - сервер уже запущен!
    echo.
    echo   Найденные процессы на порту 5000:
    echo   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000"') do (
        set PID=%%a
        echo     PID процесса: !PID!
        echo.
        echo     Информация о процессе:
        tasklist /FI "PID eq !PID!" /FO LIST 2>nul | findstr /C:"Имя образа" /C:"PID" /C:"Сеанс" /C:"Память"
        echo.
        echo     Командная строка процесса:
        wmic process where "ProcessId=!PID!" get CommandLine 2>nul | findstr /v "CommandLine"
        echo     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    )
    echo.
    echo   ⚠️  ВНИМАНИЕ: Сервер уже работает!
    echo   Это может быть:
    echo   - Старый процесс, который не был закрыт
    echo   - Процесс, запущенный ранее
    echo   - Другой экземпляр сервера
    echo.
    echo   Для остановки запустите: ОСТАНОВИТЬ_ВСЕ.bat
    echo.
)

echo [2] Проверка процессов Node.js...
echo.
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE 2>nul | find "node.exe"
if errorlevel 1 (
    echo   ✓ Процессы Node.js не найдены
) else (
    echo   ✗ Найдены процессы Node.js:
    echo   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
    echo   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo   Для остановки всех процессов Node.js запустите: ОСТАНОВИТЬ_ВСЕ.bat
)

echo.
echo [3] Проверка процессов tsx...
echo.
tasklist /FI "IMAGENAME eq tsx.exe" /FO TABLE 2>nul | find "tsx.exe"
if errorlevel 1 (
    echo   ✓ Процессы tsx.exe не найдены
) else (
    echo   ✗ Найдены процессы tsx.exe:
    echo   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    tasklist /FI "IMAGENAME eq tsx.exe" /FO TABLE
    echo   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
)

echo.
echo [4] Проверка всех портов StreamDesk...
echo.
echo   Порт 5000 (Backend):
netstat -ano 2>nul | findstr ":5000" >nul && echo     ✗ ЗАНЯТ || echo     ✓ СВОБОДЕН
echo   Порт 5173 (Frontend):
netstat -ano 2>nul | findstr ":5173" >nul && echo     ✗ ЗАНЯТ || echo     ✓ СВОБОДЕН
echo   Порт 3000 (Альтернативный):
netstat -ano 2>nul | findstr ":3000" >nul && echo     ✗ ЗАНЯТ || echo     ✓ СВОБОДЕН

echo.
echo ========================================
echo   РЕЗУЛЬТАТ ДИАГНОСТИКИ
echo ========================================
echo.
netstat -ano 2>nul | findstr ":5000" >nul
if errorlevel 1 (
    echo   ✅ ВСЁ В ПОРЯДКЕ
    echo   Сервер не запущен. Это нормально, если вы не запускали dev.bat
    echo.
    echo   Для запуска сервера используйте: dev.bat
) else (
    echo   ⚠️  СЕРВЕР УЖЕ ЗАПУЩЕН
    echo   Порт 5000 занят. Сервер работает, даже если вы не запускали dev.bat
    echo.
    echo   Возможные причины:
    echo   - Вы запускали dev.bat ранее и забыли закрыть
    echo   - Процесс остался после закрытия окна
    echo   - Другой экземпляр сервера запущен
    echo.
    echo   Действия:
    echo   1. Если хотите использовать текущий запуск - ничего не делайте
    echo   2. Если хотите перезапустить - запустите ОСТАНОВИТЬ_ВСЕ.bat
    echo.
)
echo.
pause

