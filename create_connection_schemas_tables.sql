-- Создание таблиц для схем подключения
-- Выполните этот SQL скрипт в вашей базе данных PostgreSQL

-- Включение расширения для UUID (если еще не включено)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Таблица схем подключения
CREATE TABLE IF NOT EXISTS connection_schemas (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица компонентов схем подключения
CREATE TABLE IF NOT EXISTS connection_schema_components (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    schema_id VARCHAR(255) NOT NULL REFERENCES connection_schemas(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb,
    properties JSONB DEFAULT '{}'::jsonb,
    connections JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица событий vMix расписателя
CREATE TABLE IF NOT EXISTS vmix_scheduler_events (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'scheduled',
    actions JSONB DEFAULT '[]'::jsonb,
    input TEXT,
    vmix_host TEXT,
    vmix_port INTEGER,
    executed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Создание индексов для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_connection_schema_components_schema_id ON connection_schema_components(schema_id);
CREATE INDEX IF NOT EXISTS idx_vmix_scheduler_events_start_time ON vmix_scheduler_events(start_time);
CREATE INDEX IF NOT EXISTS idx_vmix_scheduler_events_status ON vmix_scheduler_events(status);

