package com.streamdesk.staff;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Репозиторий интервалов недоступности сотрудников. Изоляция по {@code companyId}.
 */
public interface StaffUnavailabilityRepository extends JpaRepository<StaffUnavailability, String> {

    List<StaffUnavailability> findByCompanyIdOrderByStartTime(String companyId);

    List<StaffUnavailability> findByCompanyIdAndStaffIdOrderByStartTime(String companyId, String staffId);

    // Пересекается ли период с недоступностью конкретного сотрудника (для отчёта/проверок).
    @Query("""
            select u from StaffUnavailability u
            where u.companyId = :companyId
              and u.staffId = :staffId
              and u.startTime < :end
              and u.endTime > :start
            """)
    List<StaffUnavailability> findOverlapping(@Param("companyId") String companyId,
                                              @Param("staffId") String staffId,
                                              @Param("start") Instant start,
                                              @Param("end") Instant end);

    // Недоступные сотрудники компании на период — для отчёта «кто свободен».
    @Query("""
            select distinct u.staffId from StaffUnavailability u
            where u.companyId = :companyId
              and u.startTime < :end
              and u.endTime > :start
              and u.staffId in :staffIds
            """)
    List<String> findUnavailableStaffIds(@Param("companyId") String companyId,
                                         @Param("staffIds") Collection<String> staffIds,
                                         @Param("start") Instant start,
                                         @Param("end") Instant end);
}
