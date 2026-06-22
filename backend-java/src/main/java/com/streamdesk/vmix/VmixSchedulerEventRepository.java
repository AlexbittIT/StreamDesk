package com.streamdesk.vmix;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий событий планировщика vMix — замена getVmixSchedulerEvents/createVmixSchedulerEvent и т.п.
 */
public interface VmixSchedulerEventRepository extends JpaRepository<VmixSchedulerEvent, String> {

    // аналог getVmixSchedulerEvents() — по времени старта (ASC)
    List<VmixSchedulerEvent> findAllByOrderByStartTime();
}
