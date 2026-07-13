package com.streamdesk.maps;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Комментарий к зоне. Хранится элементом JSON-массива в колонке {@code zones.comments}
 * (сериализуется Hibernate/Jackson), поэтому это простой POJO, а не отдельная сущность.
 */
@Getter
@Setter
@NoArgsConstructor
public class ZoneComment {

    private String id = UUID.randomUUID().toString();
    private String authorId;
    private String authorName;
    private String text;
    private Instant createdAt = Instant.now();

    public ZoneComment(String authorId, String authorName, String text) {
        this.authorId = authorId;
        this.authorName = authorName;
        this.text = text;
    }
}
