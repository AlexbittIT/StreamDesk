package com.streamdesk.connectionschema;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Сущность компонента схемы — перенос таблицы "connection_schema_components" из shared/schema.ts.
 */
@Entity
@Table(name = "connection_schema_components")
@Getter
@Setter
public class ConnectionSchemaComponent {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "schema_id", nullable = false)
    private String schemaId;

    // computer, input, cable, signal, extender, splitter, camera, mic, network, video, display...
    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "name", nullable = false)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "position", columnDefinition = "jsonb")
    private Map<String, Object> position = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "properties", columnDefinition = "jsonb")
    private Map<String, Object> properties = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "connections", columnDefinition = "jsonb")
    private List<Object> connections = new ArrayList<>();

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
