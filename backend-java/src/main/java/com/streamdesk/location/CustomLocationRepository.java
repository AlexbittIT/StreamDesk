package com.streamdesk.location;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий локаций — замена getCustomLocations/createCustomLocation и т.п.
 */
public interface CustomLocationRepository extends JpaRepository<CustomLocation, String> {

    // аналог getCustomLocations() — по имени
    List<CustomLocation> findAllByOrderByName();
}
