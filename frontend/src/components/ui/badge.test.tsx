import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("рендерит содержимое", () => {
    render(<Badge>В работе</Badge>);
    expect(screen.getByText("В работе")).toBeInTheDocument();
  });

  it("применяет классы выбранного варианта", () => {
    render(<Badge variant="destructive">Ошибка</Badge>);
    expect(screen.getByText("Ошибка").className).toContain("destructive");
  });
});
