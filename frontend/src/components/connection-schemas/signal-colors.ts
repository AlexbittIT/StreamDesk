export interface ConnectorStyle {
  color: string;
  lineStyle: "solid" | "dashed";
  category: "video" | "audio" | "network" | "data" | "control" | "power" | "wireless" | "other";
  nameRu: string;
}

export const CONNECTOR_STYLES: Record<string, ConnectorStyle> = {
  HDMI:           { color: "#3F3F3F", lineStyle: "solid",  category: "video",    nameRu: "HDMI" },
  SDI:            { color: "#6FA8DC", lineStyle: "solid",  category: "video",    nameRu: "SDI" },
  DISPLAYPORT:    { color: "#E8B647", lineStyle: "solid",  category: "video",    nameRu: "DisplayPort" },
  DVI:            { color: "#B8860B", lineStyle: "solid",  category: "video",    nameRu: "DVI" },
  VGA:            { color: "#4A4A4A", lineStyle: "solid",  category: "video",    nameRu: "VGA" },
  GENLOCK:        { color: "#8C8C8C", lineStyle: "solid",  category: "video",    nameRu: "Генлок" },
  FIBER:          { color: "#CC0000", lineStyle: "solid",  category: "data",     nameRu: "Оптика" },
  NDI:            { color: "#2A9DF4", lineStyle: "solid",  category: "video",    nameRu: "NDI" },
  XLR:            { color: "#6FCF4D", lineStyle: "solid",  category: "audio",    nameRu: "XLR" },
  RCA:            { color: "#1B7A1B", lineStyle: "solid",  category: "audio",    nameRu: "RCA" },
  JACK:           { color: "#2DD4C4", lineStyle: "solid",  category: "audio",    nameRu: "Джек" },
  XLR_JACK:       { color: "#26C2B3", lineStyle: "solid",  category: "audio",    nameRu: "XLR/Джек" },
  MINI_JACK:      { color: "#0F9D77", lineStyle: "solid",  category: "audio",    nameRu: "Мини-джек" },
  AES_EBU:        { color: "#3D8B8B", lineStyle: "solid",  category: "audio",    nameRu: "AES/EBU" },
  TOSLINK:        { color: "#D4622D", lineStyle: "solid",  category: "audio",    nameRu: "Тослинк" },
  SPDIF_COAX:     { color: "#C97A3D", lineStyle: "solid",  category: "audio",    nameRu: "S/PDIF коакс" },
  SPEAKON:        { color: "#7B1FA2", lineStyle: "solid",  category: "audio",    nameRu: "Спикон" },
  DANTE:          { color: "#00A7B5", lineStyle: "solid",  category: "audio",    nameRu: "Dante" },
  AES67:          { color: "#008C99", lineStyle: "solid",  category: "audio",    nameRu: "AES67" },
  MIDI:           { color: "#CC1111", lineStyle: "solid",  category: "control",  nameRu: "MIDI" },
  DMX:            { color: "#E08080", lineStyle: "solid",  category: "control",  nameRu: "DMX" },
  ARTNET:         { color: "#D88A4A", lineStyle: "solid",  category: "control",  nameRu: "Art-Net" },
  SACN:           { color: "#CC8B52", lineStyle: "solid",  category: "control",  nameRu: "sACN" },
  RS232:          { color: "#707070", lineStyle: "solid",  category: "control",  nameRu: "RS-232" },
  RS485:          { color: "#5C5C5C", lineStyle: "solid",  category: "control",  nameRu: "RS-485" },
  ETHERNET:       { color: "#1C4FA0", lineStyle: "solid",  category: "network",  nameRu: "Ethernet" },
  ETHERCON:       { color: "#1C4FA0", lineStyle: "solid",  category: "network",  nameRu: "EtherCon" },
  USB:            { color: "#D946C0", lineStyle: "solid",  category: "data",     nameRu: "USB" },
  USB_C:          { color: "#C13FB0", lineStyle: "solid",  category: "data",     nameRu: "USB-C" },
  THUNDERBOLT:    { color: "#6A1B9A", lineStyle: "solid",  category: "data",     nameRu: "Thunderbolt" },
  FIREWIRE:       { color: "#C0C0C0", lineStyle: "solid",  category: "data",     nameRu: "FireWire" },
  LIGHTNING:      { color: "#4CD964", lineStyle: "solid",  category: "data",     nameRu: "Lightning" },
  POWER:          { color: "#2E5FA8", lineStyle: "solid",  category: "power",    nameRu: "Питание" },
  POWERCON:       { color: "#E040FB", lineStyle: "solid",  category: "power",    nameRu: "PowerCon" },
  IEC:            { color: "#4A4A90", lineStyle: "solid",  category: "power",    nameRu: "IEC" },
  SCHUKO:         { color: "#3A6FB5", lineStyle: "solid",  category: "power",    nameRu: "Шуко" },
  EDISON:         { color: "#2D5FA0", lineStyle: "solid",  category: "power",    nameRu: "Эдисон" },
  BANANA:         { color: "#B5651D", lineStyle: "solid",  category: "power",    nameRu: "Банан" },
  TERMINAL_BLOCK: { color: "#8C6E4A", lineStyle: "solid",  category: "power",    nameRu: "Терм. блок" },
  WIRELESS:       { color: "#7CA8DC", lineStyle: "dashed", category: "wireless", nameRu: "Беспроводное" },
  WIFI:           { color: "#5B9BD5", lineStyle: "dashed", category: "wireless", nameRu: "Wi-Fi" },
  BLUETOOTH:      { color: "#2F5FCB", lineStyle: "dashed", category: "wireless", nameRu: "Bluetooth" },
  DEFAULT:        { color: "#60a5fa", lineStyle: "solid",  category: "other",    nameRu: "Сигнал" },
};

// Legacy compat
export const SIGNAL_COLOR_PRESET: Record<string, string> =
  Object.fromEntries(Object.entries(CONNECTOR_STYLES).map(([k, v]) => [k, v.color]));

/**
 * Свободно введённый тип порта («SDI OUT 2», «разъём XLR», «RJ45») → код из
 * {@link CONNECTOR_STYLES}. Живёт здесь, а не в холсте, потому что от него зависят и
 * геометрия карточки (питание уходит на нижнюю грань), и цвет кабеля.
 */
export function normalizeConnectorCode(value?: string): string {
  const raw = (value || "").trim().toUpperCase();
  if (!raw) return "DEFAULT";
  if (CONNECTOR_STYLES[raw]) return raw;
  const cleaned = raw
    .replace(/\b(INPUT|OUTPUT|IN|OUT|PORT|ПОРТ|ВХОД|ВЫХОД)\b/g, " ")
    .replace(/[#:()[\],]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (CONNECTOR_STYLES[cleaned]) return cleaned;
  // Video
  if (cleaned.includes("HDMI")) return "HDMI";
  if (cleaned.includes("SDI") || cleaned.includes("BNC VIDEO")) return "SDI";
  if (cleaned.includes("DISPLAYPORT") || cleaned === "DP" || cleaned.includes("MINI DP")) return "DISPLAYPORT";
  if (cleaned.includes("DVI")) return "DVI";
  if (cleaned === "VGA" || cleaned.includes("D-SUB")) return "VGA";
  if (cleaned.includes("GENLOCK") || cleaned.includes("BLACK BURST") || cleaned.includes("REFERENCE SYNC")) return "GENLOCK";
  if (cleaned.includes("FIBER") || cleaned.includes("OPTICAL FIBER") || cleaned.includes("ОПТИК")) return "FIBER";
  if (cleaned.includes("NDI")) return "NDI";
  // Audio
  if (cleaned.includes("XLR") && (cleaned.includes("JACK") || cleaned.includes("COMBO"))) return "XLR_JACK";
  if (cleaned.includes("AES") && (cleaned.includes("EBU") || cleaned.includes("3") || cleaned.includes("/EBU"))) return "AES_EBU";
  if (cleaned === "XLR" || (cleaned.includes("XLR") && !cleaned.includes("JACK"))) return "XLR";
  if (cleaned.includes("MINI") && cleaned.includes("JACK")) return "MINI_JACK";
  if (cleaned.includes("3.5") || cleaned === "AUX") return "MINI_JACK";
  if (cleaned === "JACK" || cleaned.includes("6.35") || cleaned.includes("TRS") || cleaned.includes(" TS ") || cleaned === "TS") return "JACK";
  if (cleaned.includes("RCA") || cleaned.includes("ТЮЛЬП") || cleaned.includes("PHONO")) return "RCA";
  if (cleaned.includes("TOSLINK") || cleaned.includes("OPTICAL DIGITAL")) return "TOSLINK";
  if (cleaned.includes("SPDIF") || cleaned.includes("S/PDIF") || cleaned.includes("DIGITAL COAX")) return "SPDIF_COAX";
  if (cleaned.includes("SPEAKON") || cleaned.includes("NL2") || cleaned.includes("NL4") || cleaned.includes("СПИКОН")) return "SPEAKON";
  if (cleaned.includes("DANTE")) return "DANTE";
  if (cleaned.includes("AES67")) return "AES67";
  // Control
  if (cleaned === "MIDI" || cleaned.includes("5-PIN DIN") || cleaned.includes("MIDI DIN")) return "MIDI";
  if (cleaned.includes("ARTNET") || cleaned.includes("ART-NET") || cleaned.includes("ART NET")) return "ARTNET";
  if (cleaned.includes("SACN") || cleaned.includes("E1.31")) return "SACN";
  if (cleaned.includes("DMX")) return "DMX";
  if (cleaned.includes("RS232") || cleaned.includes("RS-232") || cleaned.includes("COM PORT") || cleaned.includes("DB9")) return "RS232";
  if (cleaned.includes("RS485") || cleaned.includes("RS-485")) return "RS485";
  // Network
  if (cleaned.includes("ETHERCON")) return "ETHERCON";
  if (cleaned === "ETH" || cleaned === "LAN" || cleaned === "RJ45" || cleaned.includes("ETHERNET") || cleaned.includes("CAT5") || cleaned.includes("CAT6")) return "ETHERNET";
  // Data
  if (cleaned.includes("USB") && (cleaned.includes("TYPE-C") || cleaned.includes("TYPE C") || cleaned.includes("-C") || cleaned.includes("_C"))) return "USB_C";
  if (cleaned.includes("THUNDERBOLT") || cleaned.includes("TB3") || cleaned.includes("TB4")) return "THUNDERBOLT";
  if (cleaned.includes("FIREWIRE") || cleaned.includes("IEEE 1394")) return "FIREWIRE";
  if (cleaned.includes("LIGHTNING") && !cleaned.includes("BOLT")) return "LIGHTNING";
  if (cleaned.includes("USB")) return "USB";
  // Power
  if (cleaned.includes("POWERCON") || cleaned.includes("ПАУЭРКОН")) return "POWERCON";
  if (cleaned.includes("IEC") || cleaned.includes("C13") || cleaned.includes("C14") || cleaned.includes("KETTLE")) return "IEC";
  if (cleaned.includes("SCHUKO") || cleaned.includes("ШУКО") || cleaned.includes("CEE 7")) return "SCHUKO";
  if (cleaned.includes("EDISON") || cleaned.includes("NEMA")) return "EDISON";
  if (cleaned.includes("BANANA")) return "BANANA";
  if (cleaned.includes("TERMINAL") || cleaned.includes("PHOENIX") || cleaned.includes("SCREW TERM")) return "TERMINAL_BLOCK";
  if (cleaned.includes("POWER") || cleaned.includes("MAINS") || cleaned.includes("ПИТАН") || cleaned === "AC") return "POWER";
  // Wireless
  if (cleaned.includes("BLUETOOTH") || cleaned === "BT") return "BLUETOOTH";
  if (cleaned.includes("WIFI") || cleaned.includes("WI-FI") || cleaned.includes("WLAN") || cleaned.includes("802.11")) return "WIFI";
  if (cleaned.includes("WIRELESS") || cleaned.includes("RF") || cleaned.includes("RADIO")) return "WIRELESS";
  // Legacy fallbacks
  if (cleaned === "BNC") return "SDI";
  if (cleaned === "AES" || cleaned === "MADI") return "AES_EBU";
  if (cleaned === "DC") return "POWER";
  return "DEFAULT";
}

/** Категория сигнала по свободному типу порта — «power» уходит на нижнюю грань карточки. */
export function connectorCategory(value?: string): ConnectorStyle["category"] {
  const code = normalizeConnectorCode(value);
  return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).category;
}

/** Короткая подпись на пилюле порта: «SDI», «HDMI», «ETH», «PWR». */
export function connectorShortLabel(value?: string): string {
  const code = normalizeConnectorCode(value);
  const SHORT: Record<string, string> = {
    ETHERNET: "ETH",
    ETHERCON: "ETH",
    POWER: "PWR",
    POWERCON: "PWR",
    SCHUKO: "PWR",
    EDISON: "PWR",
    TERMINAL_BLOCK: "PWR",
    DISPLAYPORT: "DP",
    THUNDERBOLT: "TB",
    MINI_JACK: "MJACK",
    SPDIF_COAX: "SPDIF",
    TERMINAL: "PWR",
    DEFAULT: "—",
  };
  return SHORT[code] ?? code.replace(/_/g, "/");
}
