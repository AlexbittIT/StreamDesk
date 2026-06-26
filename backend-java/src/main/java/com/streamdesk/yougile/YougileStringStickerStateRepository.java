package com.streamdesk.yougile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий кэша стикеров YouGile — замена getYougileStringStickerStates/upsert из database.ts.
 */
public interface YougileStringStickerStateRepository extends JpaRepository<YougileStringStickerState, String> {

    List<YougileStringStickerState> findByBoardId(String boardId);
}
