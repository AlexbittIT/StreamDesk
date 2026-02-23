@echo off
echo ============================================
echo   Kill ALL processes on ALL listening ports
echo   + all node.exe
echo ============================================
echo.
echo WARNING: This will kill PostgreSQL, MySQL, other
echo   dev servers if they are running. Continue?
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kill-all-ports.ps1"

echo.
pause
