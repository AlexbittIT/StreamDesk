import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

function Boom() {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("рендерит детей, когда ошибки нет", () => {
    render(
      <ErrorBoundary>
        <div>Рабочий контент</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Рабочий контент")).toBeInTheDocument();
  });

  it("показывает fallback при ошибке в дочернем компоненте", () => {
    // React логирует ожидаемую ошибку в console.error при выбросе в render — глушим шум.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Запасной экран</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Запасной экран")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
