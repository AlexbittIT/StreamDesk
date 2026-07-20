import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, FILTER_CATEGORIES, categoryColor } from "./category-colors";
import { deviceCategory } from "./schema-device";

const port = (id: string, type: "in" | "out", portType: string) => ({ id, name: id, type, portType });

describe("category colours", () => {
  it("gives chips, borders and corridors the same colour", () => {
    // Чип «Video» подсвечен blue-500 — рамка видеоустройства должна быть ровно ей же.
    expect(categoryColor("video").hex).toBe("#3b82f6");
    expect(categoryColor("video").dotClass).toBe("bg-blue-500");
    expect(categoryColor("audio").hex).toBe("#22c55e");
    expect(categoryColor("network").hex).toBe("#6366f1");
    expect(categoryColor("power").hex).toBe("#d946ef");
  });

  it("falls back to the neutral colour for anything unknown", () => {
    expect(categoryColor("нечто").hex).toBe(CATEGORY_COLORS.other.hex);
  });

  it("exposes exactly the four categories shown as chips", () => {
    expect(FILTER_CATEGORIES).toEqual(["video", "audio", "network", "power"]);
  });
});

describe("device category", () => {
  it("uses the dominant signal category of the ports", () => {
    const camera = { id: "c", name: "Camera", type: "device", portsOut: [port("sdi", "out", "SDI")] };
    expect(deviceCategory(camera)).toBe("video");

    const mixer = {
      id: "m",
      name: "Mixer",
      type: "device",
      portsIn: [port("x1", "in", "XLR"), port("x2", "in", "XLR")],
      portsOut: [port("v", "out", "SDI")],
    };
    expect(deviceCategory(mixer)).toBe("audio");
  });

  it("does not turn every device into power just because it has a socket", () => {
    // Розетка есть почти у всего — она не должна перебивать основной сигнал устройства.
    const camera = {
      id: "c",
      name: "Camera",
      type: "device",
      portsIn: [port("pwr", "in", "IEC")],
      portsOut: [port("sdi", "out", "SDI")],
    };
    expect(deviceCategory(camera)).toBe("video");
  });

  it("calls a device with only power ports a power device", () => {
    const distro = {
      id: "d",
      name: "Power distro",
      type: "device",
      portsIn: [port("in", "in", "IEC")],
      portsOut: [port("o1", "out", "IEC"), port("o2", "out", "IEC")],
    };
    expect(deviceCategory(distro)).toBe("power");
  });

  it("returns other when there are no ports at all", () => {
    expect(deviceCategory({ id: "x", name: "X", type: "device" })).toBe("other");
  });
});
