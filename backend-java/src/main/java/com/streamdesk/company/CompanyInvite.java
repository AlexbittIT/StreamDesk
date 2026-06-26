package com.streamdesk.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность приглашения в компанию — перенос таблицы "company_invites" из shared/schema.ts.
 */
@Entity
@Table(name = "company_invites")
@Getter
@Setter
public class CompanyInvite {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(name = "token", nullable = false, unique = true)
    private String token;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "role", nullable = false)
    private String role = "member";

    @Column(name = "status", nullable = false)
    private String status = "active";

    @Column(name = "note")
    private String note;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "used_by")
    private String usedBy;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}