@echo off
chcp 65001 >nul
echo ========================================
echo   StreamDesk - Настройка проекта
echo ========================================
echo.

:: Проверка Node.js
echo [1/4] Проверка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден!
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo ✅ Node.js найден
echo.

:: Проверка npm
echo [2/4] Проверка npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm не найден!
    pause
    exit /b 1
)
npm --version
echo ✅ npm найден
echo.

:: Установка зависимостей
echo [3/4] Установка зависимостей...
if not exist "node_modules" (
    echo Установка npm пакетов (это может занять несколько минут)...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка при установке зависимостей
        pause
        exit /b 1
    )
    echo ✅ Зависимости установлены
) else (
    echo ✅ Зависимости уже установлены
    echo Проверка dotenv...
    if not exist "node_modules\dotenv" (
        echo Установка dotenv...
        call npm install dotenv
    )
)
echo.

:: Создание .env файла
echo [4/4] Настройка файла окружения...
if not exist ".env" (
    echo Создание .env файла...
    (
        echo # Настройки базы данных
        echo # Замените значения на ваши реальные данные PostgreSQL
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/streamdesk
        echo.
        echo # Порт сервера
        echo PORT=5000
        echo.
        echo # Режим работы
        echo NODE_ENV=development
    ) > .env
    echo ✅ Файл .env создан
    echo.
    echo ⚠️  ВАЖНО: Откройте файл .env и укажите правильные данные для подключения к PostgreSQL!
    echo     - DATABASE_URL - строка подключения к базе данных
    echo     - Убедитесь, что база данных создана
    echo.
) else (
    echo ✅ Файл .env уже существует
)
echo.

:: Проверка PostgreSQL (опционально)
echo [Дополнительно] Проверка PostgreSQL...
where psql >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ PostgreSQL клиент найден
    echo    Убедитесь, что сервер PostgreSQL запущен
) else (
    echo ⚠️  PostgreSQL клиент не найден в PATH
    echo    Убедитесь, что PostgreSQL установлен и запущен
)
echo.

echo ========================================
echo   ✅ Настройка завершена!
echo ========================================
echo.
echo Следующие шаги:
echo 1. Откройте файл .env и настройте DATABASE_URL
echo 2. Убедитесь, что PostgreSQL запущен
echo 3. Запустите dev.bat для старта сервера
echo.
pause

