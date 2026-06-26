package com.streamdesk.connectionschema;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий компонентов схем — замена getConnectionSchemaComponents/createConnectionSchemaComponent.
 */
public interface ConnectionSchemaComponentRepository extends JpaRepository<ConnectionSchemaComponent, String> {

    // аналог getConnectionSchemaComponents(schemaId) — по времени создания (ASC)
    List<ConnectionSchemaComponent> findBySchemaIdOrderByCreatedAt(String schemaId);

    void deleteBySchemaId(String schemaId);
}
