package com.streamdesk.staff;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Репозиторий броней сотрудников — аналог {@code EquipmentReservationRepository},
 * но с изоляцией по {@code companyId}.
 */
public interface StaffReservationRepository extends JpaRepository<StaffReservation, String> {

    // Все брони компании по времени старта.
    List<StaffReservation> findByCompanyIdOrderByStartTime(String companyId);

    // Брони конкретного сотрудника в компании.
    List<StaffReservation> findByCompanyIdAndStaffIdOrderByStartTime(String companyId, String staffId);

    // Проверка двойного бронирования человека: активные брони того же сотрудника
    // в той же компании, пересекающиеся по времени (startTime < end AND endTime > start).
    @Query("""
            select r from StaffReservation r
            where r.companyId = :companyId
              and r.staffId = :staffId
              and r.status = 'active'
              and r.startTime < :end
              and r.endTime > :start
            """)
    List<StaffReservation> findConflicts(@Param("companyId") String companyId,
                                         @Param("staffId") String staffId,
                                         @Param("start") Instant start,
                                         @Param("end") Instant end);

    // Занятые сотрудники компании на период — для отчёта «кто свободен».
    @Query("""
            select distinct r.staffId from StaffReservation r
            where r.companyId = :companyId
              and r.status = 'active'
              and r.startTime < :end
              and r.endTime > :start
              and r.staffId in :staffIds
            """)
    List<String> findBusyStaffIds(@Param("companyId") String companyId,
                                  @Param("staffIds") Collection<String> staffIds,
                                  @Param("start") Instant start,
                                  @Param("end") Instant end);
}
