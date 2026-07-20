import { describe, expect, it } from "vitest";
import { checkConnectorCompatibility } from "./signal-compatibility";

const ok = (from?: string, to?: string) => checkConnectorCompatibility(from, to).ok;

describe("signal compatibility", () => {
  it("allows the same connector and conversions inside one category", () => {
    expect(ok("SDI", "SDI")).toBe(true);
    // Конвертация видео в видео и звука в звук — допустима.
    expect(ok("HDMI", "SDI")).toBe(true);
    expect(ok("XLR", "JACK")).toBe(true);
  });

  it("never crosses between video, audio and control", () => {
    expect(ok("HDMI", "XLR")).toBe(false);
    expect(ok("SDI", "DMX")).toBe(false);
    expect(ok("XLR", "HDMI")).toBe(false);
  });

  it("closes the IP hole: NDI must not become Dante", () => {
    // Оба идут по Ethernet, но несут разное — раньше это соединение проходило.
    expect(ok("NDI", "DANTE")).toBe(false);
    expect(ok("DANTE", "NDI")).toBe(false);
    expect(checkConnectorCompatibility("NDI", "DANTE").reason).toContain("разный сигнал");

    // Внутри одного домена IP-протоколы взаимозаменяемы.
    expect(ok("DANTE", "AES67")).toBe(true);
    expect(ok("ARTNET", "SACN")).toBe(true);
  });

  it("lets IP protocols plug into ethernet, but not into anything else", () => {
    expect(ok("DANTE", "ETHERNET")).toBe(true);
    expect(ok("NDI", "ETHERCON")).toBe(true);
    expect(ok("ETHERNET", "ARTNET")).toBe(true);
    // Dante сидит на RJ45 — в аналоговый XLR его не воткнуть, хотя категория та же.
    expect(ok("DANTE", "XLR")).toBe(false);
    expect(ok("NDI", "HDMI")).toBe(false);
  });

  it("keeps power isolated from signal", () => {
    expect(ok("IEC", "POWERCON")).toBe(true);
    expect(ok("IEC", "SDI")).toBe(false);
    expect(ok("HDMI", "POWER")).toBe(false);
    expect(checkConnectorCompatibility("IEC", "SDI").reason).toContain("Питание");
  });

  it("stays permissive when a port type is not filled in", () => {
    expect(ok(undefined, "SDI")).toBe(true);
    expect(ok("SDI", "")).toBe(true);
    expect(ok("какая-то ерунда", "SDI")).toBe(true);
  });

  it("explains every refusal", () => {
    const result = checkConnectorCompatibility("HDMI", "XLR");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
