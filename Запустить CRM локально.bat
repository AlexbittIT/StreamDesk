@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0start-crm-local.bat"
echo.
echo Если окно закрылось слишком быстро раньше, теперь смотрите лог:
echo %~dp0start-crm-local.log
echo.
pause
