// Скрипт для проверки подключения к базе данных
import postgres from "postgres";
import "dotenv/config";

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

// Показываем URL без пароля для безопасности
const urlParts = connectionString.match(/^postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)$/);
if (urlParts) {
  const [, username, password, host, database] = urlParts;
  console.log("Параметры подключения:");
  console.log(`  Пользователь: ${username}`);
  console.log(`  Пароль: ${password.length > 0 ? '***' : 'НЕ УКАЗАН!'}`);
  console.log(`  Хост: ${host}`);
  console.log(`  База данных: ${database}`);
  console.log();
}

console.log("Попытка подключения...");
console.log();

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Отключаем уведомления
});

try {
  // Простой запрос для проверки подключения
  const result = await sql`SELECT version(), current_database(), current_user`;
  
  console.log("✅ ПОДКЛЮЧЕНИЕ УСПЕШНО!");
  console.log();
  console.log("Информация о базе данных:");
  console.log(`  PostgreSQL версия: ${result[0].version.split(',')[0]}`);
  console.log(`  Текущая база: ${result[0].current_database}`);
  console.log(`  Текущий пользователь: ${result[0].current_user}`);
  console.log();
  
  // Проверяем, существует ли нужная база данных
  const dbName = urlParts ? urlParts[4] : null;
  if (dbName) {
    const databases = await sql`
      SELECT datname FROM pg_database WHERE datname = ${dbName}
    `;
    
    if (databases.length > 0) {
      console.log(`✅ База данных "${dbName}" существует`);
    } else {
      console.log(`⚠️  База данных "${dbName}" НЕ НАЙДЕНА!`);
      console.log();
      console.log("Создайте базу данных командой:");
      console.log(`  CREATE DATABASE ${dbName};`);
      console.log();
    }
  }
  
  await sql.end();
  console.log("=".repeat(50));
  process.exit(0);
  
} catch (error) {
  console.error("❌ ОШИБКА ПОДКЛЮЧЕНИЯ!");
  console.log();
  console.error("Детали ошибки:");
  console.error(`  ${error.message}`);
  console.log();
  
  // Анализ ошибки
  if (error.message.includes("ECONNREFUSED") || error.message.includes("connect")) {
    console.log("🔍 Анализ: Сервер PostgreSQL недоступен");
    console.log();
    console.log("Возможные причины:");
    console.log("  1. PostgreSQL не запущен");
    console.log("     → Откройте services.msc и запустите службу PostgreSQL");
    console.log();
    console.log("  2. Неправильный хост или порт");
    console.log("     → Проверьте формат: postgresql://user:pass@HOST:PORT/db");
    console.log("     → По умолчанию порт: 5432");
    console.log();
    console.log("  3. Файрвол блокирует подключение");
    console.log("     → Добавьте PostgreSQL в исключения файрвола");
    console.log();
  } else if (error.message.includes("password") || error.message.includes("authentication")) {
    console.log("🔍 Анализ: Проблема с аутентификацией");
    console.log();
    console.log("Возможные причины:");
    console.log("  1. Неправильный пароль");
    console.log("     → Проверьте пароль в .env файле");
    console.log();
    console.log("  2. Пароль содержит специальные символы");
    console.log("     → Закодируйте спецсимволы в URL:");
    console.log("       @ → %40");
    console.log("       : → %3A");
    console.log("       / → %2F");
    console.log("       # → %23");
    console.log("       ? → %3F");
    console.log("       & → %26");
    console.log("       = → %3D");
    console.log("       + → %2B");
    console.log("       % → %25");
    console.log("       пробел → %20");
    console.log();
    console.log("  3. Пользователь не существует");
    console.log("     → Проверьте имя пользователя в .env");
    console.log();
  } else if (error.message.includes("database") && error.message.includes("does not exist")) {
    console.log("🔍 Анализ: База данных не найдена");
    console.log();
    console.log("Решение:");
    console.log("  Создайте базу данных:");
    console.log("    1. Откройте pgAdmin");
    console.log("    2. Или используйте: psql -U postgres");
    console.log("    3. Выполните: CREATE DATABASE имя_базы;");
    console.log();
  } else {
    console.log("🔍 Дополнительная информация:");
    console.log(`   Код ошибки: ${error.code || 'неизвестно'}`);
    console.log();
  }
  
  await sql.end().catch(() => {});
  console.log("=".repeat(50));
  process.exit(1);
}

