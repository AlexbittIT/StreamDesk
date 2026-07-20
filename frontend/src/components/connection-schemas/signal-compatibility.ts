import { CONNECTOR_STYLES, connectorCategory, normalizeConnectorCode } from "./signal-colors";

/**
 * Правила совместимости портов: какой тип соединения во что может переходить.
 *
 * Прежняя проверка жила прямо в холсте и разрешала связь, если совпадала категория, плюс
 * отдельным правилом пропускала «всё IP в всё IP». Из-за последнего NDI (видео по IP) спокойно
 * соединялся с Dante (звук по IP) — переход видео → аудио, которого быть не должно.
 *
 * Здесь правила собраны явно и покрыты тестами.
 *
 * ВАЖНО: источник истины — сервер, `ConnectorTypes.compatible()` в
 * backend-java/.../connectionschema/validation/ConnectorTypes.java. Этот модуль его зеркалит,
 * чтобы отказ был виден сразу, а не после запроса. Правила менять синхронно в обоих местах —
 * иначе интерфейс разрешит связь, которую сервер отклонит (так и было с HDMI → SDI).
 */

/**
 * Протоколы, которые передаются поверх Ethernet и физически сидят на RJ45.
 * Домен — что именно они несут: смешивать разные домены нельзя.
 */
const IP_PROTOCOL_DOMAIN: Record<string, "video" | "audio" | "control"> = {
  NDI: "video",
  DANTE: "audio",
  AES67: "audio",
  ARTNET: "control",
  SACN: "control",
};

/** Транспорт Ethernet — в него допустимо включать любой IP-протокол. */
const ETHERNET_TRANSPORT = new Set(["ETHERNET", "ETHERCON"]);

export interface CompatibilityResult {
  ok: boolean;
  /** Человеческое объяснение отказа — показывается пользователю. */
  reason?: string;
}

function label(code: string): string {
  return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).nameRu;
}

/**
 * Можно ли вести кабель от порта одного типа к порту другого.
 * Направление (выход → вход) проверяется отдельно, здесь только типы разъёмов.
 */
export function checkConnectorCompatibility(fromType?: string, toType?: string): CompatibilityResult {
  const from = normalizeConnectorCode(fromType);
  const to = normalizeConnectorCode(toType);

  // Тип не указан — не мешаем: пользователь мог просто не заполнить справочник.
  if (from === "DEFAULT" || to === "DEFAULT") return { ok: true };
  if (from === to) return { ok: true };

  const fromCategory = connectorCategory(fromType);
  const toCategory = connectorCategory(toType);

  // Питание изолировано в обе стороны: ни в него, ни из него сигнал не идёт.
  if (fromCategory === "power" || toCategory === "power") {
    if (fromCategory === toCategory) return { ok: true };
    return {
      ok: false,
      reason: `Питание нельзя соединять с сигналом: ${label(from)} → ${label(to)}.`,
    };
  }

  const fromIp = IP_PROTOCOL_DOMAIN[from];
  const toIp = IP_PROTOCOL_DOMAIN[to];

  if (fromIp && toIp) {
    // Оба протокола идут по одному кабелю, но несут разное — это не переход, а подмена сигнала.
    if (fromIp === toIp) return { ok: true };
    return {
      ok: false,
      reason: `${label(from)} и ${label(to)} передают разный сигнал по IP и не переходят друг в друга.`,
    };
  }

  // IP-протокол включается в сеть — это нормальный путь: порт Dante идёт в коммутатор.
  if (fromIp || toIp) {
    const otherCode = fromIp ? to : from;
    if (ETHERNET_TRANSPORT.has(otherCode)) return { ok: true };
    return {
      ok: false,
      reason: `${label(fromIp ? from : to)} передаётся по сети — его подключают к Ethernet, а не к ${label(otherCode)}.`,
    };
  }

  // Разъёмы Ethernet взаимозаменяемы.
  if (ETHERNET_TRANSPORT.has(from) && ETHERNET_TRANSPORT.has(to)) return { ok: true };

  // Внутри одной категории переход допустим: HDMI → SDI это конвертация видео в видео.
  if (fromCategory === toCategory) return { ok: true };

  return {
    ok: false,
    reason: `Нельзя переходить из «${CATEGORY_NAMES[fromCategory] ?? fromCategory}» в «${CATEGORY_NAMES[toCategory] ?? toCategory}»: ${label(from)} → ${label(to)}.`,
  };
}

const CATEGORY_NAMES: Record<string, string> = {
  video: "Видео",
  audio: "Аудио",
  network: "Сеть",
  data: "Данные",
  control: "Управление",
  power: "Питание",
  wireless: "Беспроводное",
  other: "Прочее",
};
