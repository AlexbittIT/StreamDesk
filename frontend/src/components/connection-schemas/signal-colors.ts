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
