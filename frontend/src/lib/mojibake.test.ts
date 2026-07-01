import { describe, it, expect } from "vitest";
import { fixMojibakeText } from "@/lib/mojibake";

/**
 * Починка mojibake (двойная перекодировка UTF-8 ↔ CP1251) — та самая проблема
 * «РєР°Р±РµР»Рё» вместо «кабели» из диагностики смет.
 */
describe("fixMojibakeText", () => {
  it("восстанавливает кириллицу из mojibake", () => {
    expect(fixMojibakeText("РєР°Р±РµР»Рё")).toBe("кабели");
  });

  it("не трогает корректную кириллицу", () => {
    expect(fixMojibakeText("кабели HDMI")).toBe("кабели HDMI");
  });

  it("не трогает чистый ASCII", () => {
    expect(fixMojibakeText("HDMI cables")).toBe("HDMI cables");
  });

  it("пустую строку возвращает как есть", () => {
    expect(fixMojibakeText("")).toBe("");
  });
});
