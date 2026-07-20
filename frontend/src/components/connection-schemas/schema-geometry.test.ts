import { describe, expect, it } from "vitest";
import {
  CARD_MIN_WIDTH,
  PORT_PILL_HEIGHT,
  PORT_PILL_OVERHANG,
  textLeftOffset,
  deviceSize,
  findPortLayout,
  groupPortsBySide,
  hitTestPort,
  layoutPorts,
  portSide,
  type GeometryDevice,
} from "./schema-geometry";

const port = (id: string, type: "in" | "out", portType: string) => ({ id, name: id, type, portType });

const atem: GeometryDevice = {
  id: "atem",
  portsIn: [port("hdmi1", "in", "HDMI"), port("pwr", "in", "IEC")],
  portsOut: [port("sdi1", "out", "SDI OUT 1"), port("xlr1", "out", "XLR")],
};

describe("schema geometry", () => {
  it("puts inputs left, outputs right and power on the bottom edge", () => {
    expect(portSide(port("a", "in", "HDMI"))).toBe("left");
    expect(portSide(port("b", "out", "SDI"))).toBe("right");
    // Питание уходит вниз независимо от направления порта.
    expect(portSide(port("c", "in", "IEC"))).toBe("bottom");
    expect(portSide(port("d", "out", "POWERCON"))).toBe("bottom");

    const groups = groupPortsBySide(atem);
    expect(groups.left.map((p) => p.id)).toEqual(["hdmi1"]);
    expect(groups.right.map((p) => p.id)).toEqual(["sdi1", "xlr1"]);
    expect(groups.bottom.map((p) => p.id)).toEqual(["pwr"]);
  });

  it("grows height with side ports, not below the minimum", () => {
    const bare: GeometryDevice = { id: "bare" };
    expect(deviceSize(bare).width).toBe(CARD_MIN_WIDTH);
    expect(deviceSize(bare).height).toBeGreaterThanOrEqual(76);

    const many: GeometryDevice = {
      id: "many",
      portsOut: Array.from({ length: 6 }, (_, i) => port(`o${i}`, "out", "SDI")),
    };
    expect(deviceSize(many).height).toBeGreaterThan(deviceSize(atem).height);
  });

  it("respects a custom size but never shrinks below the computed one", () => {
    const wide: GeometryDevice = { ...atem, properties: { width: 400, height: 400 } };
    expect(deviceSize(wide)).toEqual({ width: 400, height: 400 });

    const squeezed: GeometryDevice = { ...atem, properties: { width: 10, height: 10 } };
    expect(deviceSize(squeezed).width).toBe(deviceSize(atem).width);
    expect(deviceSize(squeezed).height).toBe(deviceSize(atem).height);
  });

  it("anchors cables on the outer edge of the pill, not on the card border", () => {
    const { width, height } = deviceSize(atem);
    const left = findPortLayout(atem, "hdmi1")!;
    const right = findPortLayout(atem, "sdi1")!;
    const bottom = findPortLayout(atem, "pwr")!;

    expect(left.anchorX).toBe(-PORT_PILL_OVERHANG);
    expect(right.anchorX).toBe(width + PORT_PILL_OVERHANG);
    expect(bottom.anchorY).toBe(height + PORT_PILL_HEIGHT / 2);

  });

  it("centres the side ports vertically on the card", () => {
    const { height } = deviceSize(atem);
    const rights = layoutPorts(atem).filter((item) => item.side === "right");
    const top = Math.min(...rights.map((item) => item.centerY)) - PORT_PILL_HEIGHT / 2;
    const bottom = Math.max(...rights.map((item) => item.centerY)) + PORT_PILL_HEIGHT / 2;

    // Отступ сверху равен отступу снизу — столбец пилюль ровно по центру.
    expect(top).toBeCloseTo(height - bottom, 5);
  });

  it("shifts the text right so a left-side pill cannot cover it", () => {
    // Текст и пилюли центрированы по одной высоте, поэтому расходиться должны по горизонтали.
    const withLeft = textLeftOffset(atem);
    const withoutLeft = textLeftOffset({ id: "out-only", portsOut: [port("sdi", "out", "SDI")] });

    expect(withoutLeft).toBeLessThan(withLeft);
    // Текст начинается за внутренней половиной пилюли, а не под ней.
    expect(withLeft).toBeGreaterThanOrEqual(PORT_PILL_OVERHANG);
  });

  it("keeps a single port centred too", () => {
    const one: GeometryDevice = { id: "one", portsOut: [port("sdi", "out", "SDI")] };
    const { height } = deviceSize(one);
    expect(findPortLayout(one, "sdi")!.centerY).toBeCloseTo(height / 2, 5);
  });

  it("stacks side ports without overlapping", () => {
    const rights = layoutPorts(atem).filter((item) => item.side === "right");
    expect(rights).toHaveLength(2);
    const gap = rights[1].centerY - rights[0].centerY;
    expect(gap).toBeGreaterThanOrEqual(PORT_PILL_HEIGHT);
  });

  it("returns null for an unknown port id", () => {
    expect(findPortLayout(atem, "nope")).toBeNull();
  });

  it("hit-tests the whole pill, not just its anchor point", () => {
    const origin = { x: 1000, y: 500 };
    const sdi = findPortLayout(atem, "sdi1")!;

    // Середина пилюли — именно туда обычно бросают связь.
    const middle = { x: origin.x + sdi.centerX, y: origin.y + sdi.centerY };
    expect(hitTestPort(atem, origin, middle)?.port.id).toBe("sdi1");

    // Точка крепления на внешней кромке тоже засчитывается.
    const anchor = { x: origin.x + sdi.anchorX, y: origin.y + sdi.anchorY };
    expect(hitTestPort(atem, origin, anchor)?.port.id).toBe("sdi1");

    // Далеко от карточки — мимо.
    expect(hitTestPort(atem, origin, { x: origin.x + 9999, y: origin.y })).toBeNull();

    // Фильтр по направлению не даёт подцепить выход, когда ищем вход.
    expect(hitTestPort(atem, origin, middle, (port) => port.type === "in")).toBeNull();
  });
});
