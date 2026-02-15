// Скрипт для проверки подключения к базе данных
import postgres from "postgres";
import dotenv from "dotenv";

// Загружаем .env файл
dotenv.config();

console.log("=".repeat(50));
console.log("Проверка подключения к PostgreSQL");
console.log("=".repeat(50));
console.log();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ОШИБКА: DATABASE_URL не найден в переменных окружения!");
  console.log();
  console.log("Проверьте:");
  console.log("  1. Файл .env существует в корне проекта");
  console.log("  2. В файле .env есть строка DATABASE_URL=...");
  console.log();
  process.exit(1);
}

console.log("✅ DATABASE_URL найден");
console.log();

// Показываем параметры подключения (без пароля)
try {
  const urlMatch = connectionString.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (urlMatch) {
    const [, username, password, host, port, database] = urlMatch;
    console.log("Параметры подключения:");
    console.log(`  Пользователь: ${username}`);
    console.log(`  Пароль: ${password ? '*** (скрыт)' : 'НЕ УКАЗАН!'}`);
    console.log(`  Хост: ${host}`);
    console.log(`  Порт: ${port}`);
    console.log(`  База данных: ${database}`);
    console.log();
  }
} catch (e) {
  console.log("⚠️  Не удалось разобрать формат DATABASE_URL");
  console.log();
}

console.log("Попытка подключения...");
console.log();

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

try {
  // Простой запрос для проверки подключения
  const result = await sql`SELECT version(), current_database(), current_user`;
  
  console.log("✅ ПОДКЛЮЧЕНИЕ УСПЕШНО!");
  console.log();
  console.log("Информация о базе данных:");
  console.log(`  PostgreSQL: ${result[0].version.split(',')[0]}`);
  console.log(`  Текущая база: ${result[0].current_database}`);
  console.log(`  Пользователь: ${result[0].current_user}`);
  console.log();
  
  await sql.end();
  console.log("=".repeat(50));
  console.log("✅ Всё готово! Можно запускать dev.bat");
  console.log("=".repeat(50));
  process.exit(0);
  
} catch (error) {
  console.error("❌ ОШИБКА ПОДКЛЮЧЕНИЯ!");
  console.log();
  console.error("Детали ошибки:");
  console.error(`  ${error.message}`);
  console.log();
  
  // Анализ ошибки
  const errorMsg = error.message.toLowerCase();
  
  if (errorMsg.includes("econnrefused") || errorMsg.includes("connect")) {
    console.log("🔍 Проблема: Сервер PostgreSQL недоступен");
    console.log();
    console.log("Решение:");
    console.log("  1. Проверьте, запущен ли PostgreSQL:");
    console.log("     → Нажмите Win+R, введите: services.msc");
    console.log("     → Найдите 'PostgreSQL' и запустите службу");
    console.log();
    console.log("  2. Проверьте хост и порт в .env:");
    console.log("     → Обычно: localhost:5432");
    console.log();
  } else if (errorMsg.includes("password") || errorMsg.includes("authentication")) {
    console.log("🔍 Проблема: Неверный пароль или имя пользователя");
    console.log();
    console.log("Решение:");
    console.log("  1. Проверьте пароль в .env файле");
    console.log();
    console.log("  2. Если в пароле есть спецсимволы (@, #, $, %, &, ? и т.д.):");
    console.log("     → Откройте encode-password.html в браузере");
    console.log("     → Закодируйте пароль и обновите .env");
    console.log();
    console.log("  3. Попробуйте подключиться напрямую:");
    console.log("     → psql -U postgres -h localhost");
    console.log("     → Введите пароль");
    console.log();
  } else if (errorMsg.includes("database") && errorMsg.includes("not exist")) {
    console.log("🔍 Проблема: База данных не найдена");
    console.log();
    console.log("Решение:");
    console.log("  1. Откройте pgAdmin");
    console.log("  2. Подключитесь к серверу");
    console.log("  3. Создайте базу данных: CREATE DATABASE streamdesk;");
    console.log();
  } else {
    console.log("🔍 Дополнительная информация:");
    console.log(`   Код: ${error.code || 'неизвестно'}`);
    console.log();
    console.log("Возможные причины:");
    console.log("  - Неправильный формат DATABASE_URL");
    console.log("  - Файрвол блокирует подключение");
    console.log("  - PostgreSQL не установлен");
    console.log();
  }
  
  await sql.end().catch(() => {});
  console.log("=".repeat(50));
  console.log();
  console.log("📖 Подробные инструкции:");
  console.log("   → Читайте файл ПОШАГОВАЯ_ДИАГНОСТИКА.txt");
  console.log("   → Или ЧТО_ДЕЛАТЬ_ЕСЛИ_НЕ_РАБОТАЕТ.txt");
  console.log();
  process.exit(1);
}

