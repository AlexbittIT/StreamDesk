-- ============================================================
-- Task 2 / Phase B — порты оборудования (AI port lookup)
-- ddl-auto=validate: Hibernate схему НЕ создаёт. Прогнать этот скрипт
-- по рабочей БД ДО запуска backend-java, иначе старт упадёт на валидации.
--   psql "$DATABASE_URL" -f create_equipment_ports_tables.sql
-- Связано: справочник разъёмов — ресурс backend-java/.../connector_types.json
-- (Phase A), коды портов валидируются по нему в коде, отдельная FK не нужна.
-- ============================================================

-- Производитель устройства — нужен как часть ключа кэша «производитель+модель».
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(128);

-- Кэш портов по модели: один раз найдено/подтверждено — переиспользуется навсегда.
CREATE TABLE IF NOT EXISTS equipment_model_ports (
  id                 VARCHAR(36) PRIMARY KEY,
  manufacturer       VARCHAR(128) NOT NULL,
  model              VARCHAR(128) NOT NULL,
  device_type        VARCHAR(32),
  -- {"portsIn":[{"id","name","portType","type":"in"}],"portsOut":[...]}
  ports              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- модульное оборудование (слоты/карты): порты НЕ угадываются автоматически
  configurable_ports BOOLEAN NOT NULL DEFAULT FALSE,
  status             VARCHAR(16) NOT NULL DEFAULT 'pending_review'
                     CHECK (status IN ('pending_review','confirmed','rejected')),
  -- provenance (на уровне модели): источник, уверенность, когда получено
  source_model       VARCHAR(64),   -- например deepseek-chat
  source_url         TEXT,          -- nullable: реального fetch в v1 нет
  confidence         NUMERIC(4,3),  -- 0..1
  fetched_at         TIMESTAMP,
  reviewed_by        VARCHAR(36),
  reviewed_at        TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_equipment_model UNIQUE (manufacturer, model)
);

-- Очередь разъёмов, которых нет в справочнике: ручное добавление новой строки
-- в справочник (не теряем и не угадываем).
CREATE TABLE IF NOT EXISTS unmapped_terms (
  id             VARCHAR(36) PRIMARY KEY,
  term           VARCHAR(256) NOT NULL,   -- сырое обозначение разъёма из AI/спеки
  manufacturer   VARCHAR(128),
  model          VARCHAR(128),
  context        JSONB,                   -- {"portName","direction",...}
  suggested_code VARCHAR(32),             -- nullable: какой код предложить в справочник
  status         VARCHAR(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','added','dismissed')),
  resolved_by    VARCHAR(36),
  resolved_at    TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unmapped_terms_status ON unmapped_terms (status);
CREATE INDEX IF NOT EXISTS idx_equipment_model_ports_status ON equipment_model_ports (status);
