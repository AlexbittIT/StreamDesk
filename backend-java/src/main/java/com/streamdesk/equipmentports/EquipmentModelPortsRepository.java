package com.streamdesk.equipmentports;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий кэша портов по модели. Ключ поиска — «производитель + модель»
 * без учёта регистра.
 */
public interface EquipmentModelPortsRepository extends JpaRepository<EquipmentModelPorts, String> {

    Optional<EquipmentModelPorts> findFirstByManufacturerIgnoreCaseAndModelIgnoreCase(String manufacturer,
                                                                                       String model);

    List<EquipmentModelPorts> findByStatusOrderByUpdatedAtDesc(String status);
}
