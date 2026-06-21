package com.streamdesk.checkout;

import com.streamdesk.checkout.dto.CheckoutCreateRequest;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика запросов на выдачу/перенос оборудования.
 * Доимплементация (в Node не было): создание запроса, подтверждение (с выдачей/переносом оборудования), отклонение.
 */
@Service
public class CheckoutService {

    private final EquipmentCheckoutRequestRepository repository;
    private final EquipmentRepository equipmentRepository;

    public CheckoutService(EquipmentCheckoutRequestRepository repository, EquipmentRepository equipmentRepository) {
        this.repository = repository;
        this.equipmentRepository = equipmentRepository;
    }

    public List<EquipmentCheckoutRequest> list() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public EquipmentCheckoutRequest create(CheckoutCreateRequest req, String requestedBy) {
        if (req == null || isBlank(req.equipmentId())) {
            throw ApiException.badRequest("equipmentId is required");
        }
        EquipmentCheckoutRequest request = new EquipmentCheckoutRequest();
        request.setEquipmentId(req.equipmentId());
        request.setRequestedBy(requestedBy);
        request.setRequestType(isBlank(req.requestType()) ? "checkout" : req.requestType());
        request.setCompanyId(req.companyId());
        request.setLocation(req.location());
        request.setNote(req.note());
        request.setStatus("pending");

        // Для переноса фиксируем текущего держателя (из запроса или с самого оборудования).
        String currentHolder = req.currentHolder();
        if (isBlank(currentHolder)) {
            currentHolder = equipmentRepository.findById(req.equipmentId())
                    .map(Equipment::getAssignedTo)
                    .orElse(null);
        }
        request.setCurrentHolder(currentHolder);

        return repository.save(request);
    }

    @Transactional
    public EquipmentCheckoutRequest approve(String id, String reviewerId) {
        EquipmentCheckoutRequest request = find(id);
        request.setStatus("approved");
        request.setReviewedBy(reviewerId);
        request.setReviewedAt(Instant.now());
        request.setUpdatedAt(Instant.now());

        // Применяем к оборудованию: выдача — назначаем держателя и статус in_use; перенос — меняем держателя/локацию.
        equipmentRepository.findById(request.getEquipmentId()).ifPresent(equipment -> {
            equipment.setAssignedTo(request.getRequestedBy());
            if ("transfer".equals(request.getRequestType())) {
                if (!isBlank(request.getLocation())) {
                    equipment.setLocation(request.getLocation());
                }
            } else {
                equipment.setStatus("in_use");
            }
            equipmentRepository.save(equipment);
        });

        return repository.save(request);
    }

    @Transactional
    public EquipmentCheckoutRequest reject(String id, String reviewerId) {
        EquipmentCheckoutRequest request = find(id);
        request.setStatus("rejected");
        request.setReviewedBy(reviewerId);
        request.setReviewedAt(Instant.now());
        request.setUpdatedAt(Instant.now());
        return repository.save(request);
    }

    private EquipmentCheckoutRequest find(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Checkout request not found"));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
