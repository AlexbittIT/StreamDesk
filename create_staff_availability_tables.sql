-- Таблицы модуля «Доступность и бронирование сотрудников» (feat/staff-availability).
-- Выполните этот SQL в базе PostgreSQL (на проде ddl-auto=validate — схема правится миграциями).
-- Аналог equipment_reservations, но для людей и с изоляцией по company_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Брони сотрудников на период. Изоляция по company_id; двойное бронирование
-- (пересечение по времени для активных броней того же сотрудника) запрещено на уровне приложения.
CREATE TABLE IF NOT EXISTS staff_reservations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    staff_id VARCHAR(255) NOT NULL,
    company_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(255),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Интервалы недоступности сотрудника (отпуск/выходной/болезнь/ручной блок), не связанные с бронью.
CREATE TABLE IF NOT EXISTS staff_unavailability (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    staff_id VARCHAR(255) NOT NULL,
    company_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    reason TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы под типовые выборки: конфликты и отчёт «кто свободен» фильтруют по (company_id, staff_id)
-- и по пересечению времени.
CREATE INDEX IF NOT EXISTS idx_staff_reservations_company_staff
    ON staff_reservations(company_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_reservations_time
    ON staff_reservations(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_staff_unavailability_company_staff
    ON staff_unavailability(company_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_unavailability_time
    ON staff_unavailability(start_time, end_time);
