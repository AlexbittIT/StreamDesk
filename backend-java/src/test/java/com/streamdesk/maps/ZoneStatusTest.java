package com.streamdesk.maps;

import com.streamdesk.config.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Правила конечного автомата статусов зоны (docs/maps-api.md §3) — чистый юнит-тест без Spring.
 * Фиксирует таблицу переходов: если её случайно изменят, тест упадёт.
 */
class ZoneStatusTest {

    @Test
    void defaultStatus_isNotStarted() {
        assertThat(ZoneStatus.defaultStatus()).isEqualTo(ZoneStatus.NOT_STARTED);
    }

    @ParameterizedTest(name = "{0} → {1} допустим")
    @CsvSource({
            "NOT_STARTED, IN_PROGRESS",
            "IN_PROGRESS, DONE",
            "IN_PROGRESS, NEEDS_REVIEW",
            "IN_PROGRESS, PROBLEM",
            "DONE, NEEDS_REVIEW",
            "DONE, VERIFIED",
            "DONE, PROBLEM",
            "NEEDS_REVIEW, VERIFIED",
            "NEEDS_REVIEW, IN_PROGRESS",
            "NEEDS_REVIEW, PROBLEM",
            "VERIFIED, IN_PROGRESS",
            "VERIFIED, PROBLEM",
            "PROBLEM, IN_PROGRESS",
            "PROBLEM, DONE",
    })
    void allowedTransitions(ZoneStatus from, ZoneStatus to) {
        assertThat(from.canTransitionTo(to)).isTrue();
    }

    @ParameterizedTest(name = "{0} → {1} недопустим")
    @CsvSource({
            "NOT_STARTED, DONE",
            "NOT_STARTED, VERIFIED",
            "NOT_STARTED, NEEDS_REVIEW",
            "IN_PROGRESS, VERIFIED",
            "IN_PROGRESS, NOT_STARTED",
            "DONE, IN_PROGRESS",
            "DONE, NOT_STARTED",
            "NEEDS_REVIEW, DONE",
            "VERIFIED, DONE",
            "VERIFIED, NEEDS_REVIEW",
            "PROBLEM, VERIFIED",
            "PROBLEM, NEEDS_REVIEW",
            "PROBLEM, NOT_STARTED",
    })
    void rejectedTransitions(ZoneStatus from, ZoneStatus to) {
        assertThat(from.canTransitionTo(to)).isFalse();
    }

    @Test
    void problemReachableFromEveryStatus() {
        for (ZoneStatus from : ZoneStatus.values()) {
            boolean expected = from != ZoneStatus.PROBLEM; // из problem в problem — нет (это self-переход)
            assertThat(from.canTransitionTo(ZoneStatus.PROBLEM))
                    .as("%s → PROBLEM", from)
                    .isEqualTo(expected);
        }
    }

    @ParameterizedTest
    @EnumSource(ZoneStatus.class)
    void selfTransitionAlwaysRejected(ZoneStatus status) {
        assertThat(status.canTransitionTo(status)).isFalse();
    }

    @Test
    void fromApi_parsesKnownValue() {
        assertThat(ZoneStatus.fromApi("in_progress")).isEqualTo(ZoneStatus.IN_PROGRESS);
        assertThat(ZoneStatus.fromApi("  NEEDS_REVIEW ".toLowerCase().trim())).isEqualTo(ZoneStatus.NEEDS_REVIEW);
    }

    @Test
    void fromApi_rejectsUnknownValue() {
        assertThatThrownBy(() -> ZoneStatus.fromApi("frozen"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Неизвестный статус");
    }
}
