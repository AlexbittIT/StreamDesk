package com.streamdesk.yougile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий кэша колонок YouGile — замена upsertYougileColumns из database.ts.
 */
public interface YougileColumnRepository extends JpaRepository<YougileColumn, String> {

    List<YougileColumn> findByBoardIdOrderByOrder(String boardId);
}
