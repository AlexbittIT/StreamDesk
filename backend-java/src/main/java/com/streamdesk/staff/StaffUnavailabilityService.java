package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.staff.dto.StaffUnavailabilityRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика интервалов недоступности сотрудников (отпуск/выходной/блок). Изоляция по компании.
 */
@Service
public class StaffUnavailabilityService {

    private final StaffUnavailabilityRepository repository;
    private final StaffAccess staffAccess;

    public StaffUnavailabilityService(StaffUnavailabilityRepository repository,
                                      StaffAccess staffAccess) {
        this.repository = repository;
        this.staffAccess = staffAccess;
    }

    public List<StaffUnavailability> list(String companyId, String staffId, AuthenticatedUser user) {
        String company = staffAccess.resolveReadableCompanyId(companyId, user);
        if (staffId != null && !staffId.isBlank()) {
            return repository.findByCompanyIdAndStaffIdOrderByStartTime(company, staffId);
        }
        return repository.findByCompanyIdOrderByStartTime(company);
    }

    @Transactional
    public StaffUnavailability create(StaffUnavailabilityRequest req, AuthenticatedUser user) {
        String company = staffAccess.resolveWritableCompanyId(req.companyId(), user);
        if (isBlank(req.staffId())) {
            throw ApiException.badRequest("staffId is required");
        }
        Instant start = requireInstant(req.startTime());
        Instant end = requireInstant(req.endTime());
        if (!end.isAfter(start)) {
            throw ApiException.badRequest("Дата окончания должна быть позже начала");
        }

        StaffUnavailability entity = new StaffUnavailability();
        entity.setStaffId(req.staffId());
        entity.setCompanyId(company);
        entity.setStartTime(start);
        entity.setEndTime(end);
        entity.setReason(isBlank(req.reason()) ? null : req.reason());
        entity.setCreatedBy(user != null ? user.id() : null);
        return repository.save(entity);
    }

    @Transactional
    public void delete(String id, AuthenticatedUser user) {
        StaffUnavailability entity = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Запись недоступности не найдена"));
        staffAccess.assertMember(entity.getCompanyId(), user);
        repository.deleteById(id);
    }

    private Instant requireInstant(String value) {
        if (isBlank(value)) {
            throw ApiException.badRequest("Некорректные даты недоступности");
        }
        try {
            Instant instant = TimeParse.toInstant(value);
            if (instant == null) {
                throw ApiException.badRequest("Некорректные даты недоступности");
            }
            return instant;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Некорректные даты недоступности");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
