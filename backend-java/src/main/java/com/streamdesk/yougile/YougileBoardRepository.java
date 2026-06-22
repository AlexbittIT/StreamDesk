package com.streamdesk.yougile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий кэша досок YouGile — замена getYougileBoards/upsertYougileBoards из database.ts.
 */
public interface YougileBoardRepository extends JpaRepository<YougileBoard, String> {

    List<YougileBoard> findByProjectId(String projectId);
}
