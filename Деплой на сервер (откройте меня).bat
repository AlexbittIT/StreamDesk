@echo off
:: Запускает деплой в отдельном окне CMD, которое не закроется при ошибке.
cd /d "%~dp0"
start "Деплой StreamDesk" cmd /k "cd /d "%~dp0" && call "Деплой на сервер.bat""
