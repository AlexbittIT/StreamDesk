import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (объединение классов)", () => {
  it("склеивает классы", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("отбрасывает falsy-значения", () => {
    expect(cn("a", false && "x", null, undefined, "c")).toBe("a c");
  });

  it("разрешает конфликт tailwind-классов в пользу последнего", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
