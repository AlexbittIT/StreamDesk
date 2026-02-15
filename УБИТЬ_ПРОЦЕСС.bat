@echo off
chcp 65001 >nul
echo ========================================
echo   Принудительная остановка процесса
echo ========================================
echo.

if "%1"=="" (
    echo Использование: УБИТЬ_ПРОЦЕСС.bat [PID]
    echo.
    echo Пример: УБИТЬ_ПРОЦЕСС.bat 12345
    echo.
    echo Для поиска PID используйте: ПРОВЕРИТЬ_ПОРТЫ.bat
    echo.
    pause
    exit /b
)

set PID=%1
echo Остановка процесса с PID: %PID%
echo.

taskkill /F /PID %PID% 2>nul
if errorlevel 1 (
    echo ✗ Не удалось остановить процесс %PID%
    echo   Возможно, процесс уже остановлен или нет прав доступа
) else (
    echo ✓ Процесс %PID% успешно остановлен
)

echo.
pause


