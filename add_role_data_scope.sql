-- Миграция: уровень видимости данных для ролей (фича «уровни доступа»).
--
-- Добавляет колонку roles.data_scope: own | department | all.
-- Значение по умолчанию 'all' — старые роли продолжают видеть всё по своей компании,
-- то есть поведение до фичи сохраняется (обратная совместимость).
--
-- На локальной/compose-базе колонку создаёт Hibernate (SPRING_JPA_HIBERNATE_DDL_AUTO=update).
-- На рабочей базе (ddl-auto=validate) выполните этот скрипт вручную ДО деплоя новой версии.

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'all';

-- На случай, если колонка уже существовала с NULL-значениями — нормализуем.
UPDATE roles SET data_scope = 'all' WHERE data_scope IS NULL;
