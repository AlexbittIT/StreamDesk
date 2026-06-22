package com.streamdesk.connectionschema;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий схем подключения — замена getConnectionSchemas/createConnectionSchema и т.п.
 */
public interface ConnectionSchemaRepository extends JpaRepository<ConnectionSchema, String> {

    // аналог getConnectionSchemas() — по времени создания (DESC)
    List<ConnectionSchema> findByOrderByCreatedAtDesc();
}
