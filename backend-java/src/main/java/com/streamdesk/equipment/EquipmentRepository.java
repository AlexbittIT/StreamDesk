package com.streamdesk.equipment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий оборудования — замена методов getEquipment* из IStorage.
 */
public interface EquipmentRepository extends JpaRepository<Equipment, String> {

    // аналог getEquipment() — по имени
    List<Equipment> findAllByOrderByName();

    // аналог getEquipmentByStatus
    List<Equipment> findByStatusOrderByName(String status);

    // аналог getEquipmentByBarcode (упрощённо — только по barcode)
    Optional<Equipment> findByBarcode(String barcode);
}