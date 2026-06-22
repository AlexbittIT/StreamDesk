package com.streamdesk.reservation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

/**
 * Репозиторий резерваций оборудования — замена getEquipmentReservations/checkEquipmentConflicts и т.п.
 */
public interface EquipmentReservationRepository extends JpaRepository<EquipmentReservation, String> {

    // аналог getEquipmentReservations() — по времени старта
    List<EquipmentReservation> findAllByOrderByStartTime();

    // аналог getEquipmentReservationsByEquipment(equipmentId)
    List<EquipmentReservation> findByEquipmentIdOrderByStartTime(String equipmentId);

    // аналог checkEquipmentConflicts — пересечение по времени для активных резерваций того же оборудования
    @Query("""
            select r from EquipmentReservation r
            where r.equipmentId = :equipmentId
              and r.status = 'active'
              and r.startTime < :end
              and r.endTime > :start
            """)
    List<EquipmentReservation> findConflicts(@Param("equipmentId") String equipmentId,
                                             @Param("start") Instant start,
                                             @Param("end") Instant end);
}
