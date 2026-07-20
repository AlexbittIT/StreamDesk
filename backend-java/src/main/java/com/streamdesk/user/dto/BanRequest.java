package com.streamdesk.user.dto;

/** Тело PUT /api/users/{id}/ban — {@code banned=true} блокирует, {@code false} снимает бан. */
public record BanRequest(Boolean banned) {
}
