-- Таблицы модуля «Схема площадки» (Maps) — контракт docs/maps-api.md / docs/openapi-maps.yaml.
-- Выполните этот SQL в базе PostgreSQL (на проде ddl-auto=validate — схема правится миграциями).
-- Здесь только часть контракта: карты, зоны, история статусов. Комментарии/фото — отдельная миграция (VM-16).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Карты (планы площадок). Изоляция по company_id.
CREATE TABLE IF NOT EXISTS maps (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id VARCHAR(255) NOT NULL,
    venue_id VARCHAR(255),
    name TEXT NOT NULL,
    image_url TEXT,
    image_width INTEGER,
    image_height INTEGER,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Зоны карты. status — одно из 6 значений (see docs/maps-api.md §3), version — оптимистичная блокировка.
CREATE TABLE IF NOT EXISTS zones (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    map_id VARCHAR(255) NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    company_id VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'not_started',
    assignee_id VARCHAR(255),
    assignee_type VARCHAR(32),
    color VARCHAR(32),
    version INTEGER NOT NULL DEFAULT 1,
    comments_count INTEGER NOT NULL DEFAULT 0,
    photos_count INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- История смен статуса зоны: кто/когда/из→в. Пишется на каждый переход.
CREATE TABLE IF NOT EXISTS zone_status_history (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    zone_id VARCHAR(255) NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_by VARCHAR(255),
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы под типовые выборки (по компании, по карте, история по зоне).
CREATE INDEX IF NOT EXISTS idx_maps_company_id ON maps(company_id);
CREATE INDEX IF NOT EXISTS idx_zones_map_id ON zones(map_id);
CREATE INDEX IF NOT EXISTS idx_zones_company_id ON zones(company_id);
CREATE INDEX IF NOT EXISTS idx_zone_status_history_zone_id ON zone_status_history(zone_id);
