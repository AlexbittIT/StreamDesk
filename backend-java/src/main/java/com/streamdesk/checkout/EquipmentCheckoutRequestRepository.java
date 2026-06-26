package com.streamdesk.checkout;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий запросов на выдачу оборудования.
 */
public interface EquipmentCheckoutRequestRepository extends JpaRepository<EquipmentCheckoutRequest, String> {

    List<EquipmentCheckoutRequest> findAllByOrderByCreatedAtDesc();
}
