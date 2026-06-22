package com.streamdesk.obs;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий подключений OBS — замена getObsConnections/createObsConnection и т.п.
 */
public interface ObsConnectionRepository extends JpaRepository<ObsConnection, String> {

    // аналог getObsConnections() — по имени
    List<ObsConnection> findAllByOrderByName();
}
