@echo off
chcp 65001 >nul
title StreamDesk - Деплой на сервер

echo ========================================
echo   🚀 Деплой StreamDesk на Ubuntu сервер
echo ========================================
echo.

REM Настройки сервера (ИЗМЕНИТЕ НА СВОИ!)
set SERVER_USER=ваш_пользователь
set SERVER_IP=192.168.1.100
set SERVER_PATH=/var/www/streamdesk

echo ⚙️  Настройки подключения:
echo    Пользователь: %SERVER_USER%
echo    IP адрес: %SERVER_IP%
echo    Путь на сервере: %SERVER_PATH%
echo.
echo ⚠️  ВАЖНО: Убедитесь, что вы изменили настройки в начале этого файла!
echo.
pause

echo.
echo 📤 Синхронизация файлов на сервер...
echo.

REM Проверка наличия rsync
where rsync >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ rsync не найден!
    echo.
    echo Установите rsync одним из способов:
    echo   1. Установите Git Bash: https://git-scm.com/downloads
    echo   2. Используйте WSL (Windows Subsystem for Linux)
    echo   3. Установите через Chocolatey: choco install rsync
    echo.
    pause
    exit /b 1
)

REM Синхронизация файлов (исключаем node_modules, .git, и другие ненужные файлы)
REM Скрипт работает из текущей директории, где находится файл
rsync -avz --delete ^
  --exclude 'node_modules' ^
  --exclude '.git' ^
  --exclude 'client/node_modules' ^
  --exclude 'client/dist' ^
  --exclude '.env' ^
  --exclude '*.log' ^
  --exclude '.DS_Store' ^
  --exclude 'Thumbs.db' ^
  --exclude 'attached_assets' ^
  "%CD%\" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/

if %errorlevel% neq 0 (
    echo.
    echo ❌ Ошибка при синхронизации файлов!
    echo Проверьте:
    echo   - Правильность IP адреса и имени пользователя
    echo   - Наличие SSH ключа или пароля
    echo   - Доступность сервера по сети
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ Файлы синхронизированы
echo.

echo 🔄 Выполнение деплоя на сервере...
echo.

REM Выполнение скрипта деплоя на сервере
ssh %SERVER_USER%@%SERVER_IP% "cd %SERVER_PATH% && chmod +x deploy-to-server.sh && ./deploy-to-server.sh"

if %errorlevel% neq 0 (
    echo.
    echo ❌ Ошибка при выполнении деплоя на сервере!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✅ Деплой завершен успешно!
echo ========================================
echo.
echo Проверьте работу приложения:
echo   https://ваш-домен.com
echo.
pause