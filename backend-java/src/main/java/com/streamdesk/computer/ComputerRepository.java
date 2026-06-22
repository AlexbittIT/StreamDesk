package com.streamdesk.computer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий компьютеров — замена getComputers/createComputer и т.п.
 */
public interface ComputerRepository extends JpaRepository<Computer, String> {

    // аналог getComputers() — по имени
    List<Computer> findAllByOrderByName();
}
