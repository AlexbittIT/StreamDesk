// Глобальный setup для Vitest: матчеры jest-dom (toBeInTheDocument и т.п.)
// и очистка DOM между тестами.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
