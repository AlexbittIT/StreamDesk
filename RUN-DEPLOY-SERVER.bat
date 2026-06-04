@echo off
cd /d "%~dp0"
start "StreamDesk Deploy" cmd /k "cd /d "%~dp0" && call deploy-server.bat"
