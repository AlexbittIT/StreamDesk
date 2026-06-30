-- Создание таблицы сохранённых смет
-- Выполните этот SQL-скрипт в вашей базе данных PostgreSQL
-- (на dev/compose с SPRING_JPA_HIBERNATE_DDL_AUTO=update таблица создаётся автоматически).

-- Расширение для gen_random_uuid() (если ещё не включено)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS estimates (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    company_id VARCHAR(255),
    created_by VARCHAR(255),
    created_by_name TEXT,
    visibility TEXT NOT NULL DEFAULT 'company',
    delivery_distance_km TEXT DEFAULT '0',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индекс для выборки смет компании по времени (новые сверху)
CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON estimates(created_at DESC);
