package com.streamdesk.company;

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
import java.util.List;
import java.util.UUID;

/**
 * Сущность участника компании — перенос таблицы "company_members" из shared/schema.ts.
 */
@Entity
@Table(name = "company_members")
@Getter
@Setter
public class CompanyMember {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "role", nullable = false)
    private String role = "member";

    @Column(name = "status", nullable = false)
    private String status = "active";

    @Column(name = "invited_by")
    private String invitedBy;

    @Column(name = "approved_by")
    private String approvedBy;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "permissions", columnDefinition = "jsonb")
    private List<String> permissions = new ArrayList<>();

    @Column(name = "joined_at")
    private Instant joinedAt;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}