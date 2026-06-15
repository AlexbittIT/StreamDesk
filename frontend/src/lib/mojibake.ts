const CP1251_CHARS = [
  "\u0402", "\u0403", "\u201A", "\u0453", "\u201E", "\u2026", "\u2020", "\u2021",
  "\u20AC", "\u2030", "\u0409", "\u2039", "\u040A", "\u040C", "\u040B", "\u040F",
  "\u0452", "\u2018", "\u2019", "\u201C", "\u201D", "\u2022", "\u2013", "\u2014",
  "", "\u2122", "\u0459", "\u203A", "\u045A", "\u045C", "\u045B", "\u045F",
  "\u00A0", "\u040E", "\u045E", "\u0408", "\u00A4", "\u0490", "\u00A6", "\u00A7",
  "\u0401", "\u00A9", "\u0404", "\u00AB", "\u00AC", "\u00AD", "\u00AE", "\u0407",
  "\u00B0", "\u00B1", "\u0406", "\u0456", "\u0491", "\u00B5", "\u00B6", "\u00B7",
  "\u0451", "\u2116", "\u0454", "\u00BB", "\u0458", "\u0405", "\u0455", "\u0457",
] as const;

const cp1251Bytes = new Map<string, number>();

for (let i = 0; i < CP1251_CHARS.length; i += 1) {
  const char = CP1251_CHARS[i];
  if (char) cp1251Bytes.set(char, 0x80 + i);
}

for (let code = 0x0410; code <= 0x044F; code += 1) {
  cp1251Bytes.set(String.fromCharCode(code), 0xC0 + (code - 0x0410));
}

const mojibakePattern = /(?:[\u0420\u0421][\u0400-\u04FF]|\u0432\u0402|\u0412[\u00AB\u00BB]|\u00C2[^\s]?|\u00D0|\u00D1)/;
const utf8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;

function mojibakeScore(value: string) {
  return (value.match(/[\u0420\u0421][\u0400-\u04FF]|\u0432\u0402|\u0412[\u00AB\u00BB]|\u00C2|\u00D0|\u00D1/g) || []).length;
}

export function fixMojibakeText(value: string): string {
  if (!value || !utf8Decoder || !mojibakePattern.test(value)) return value;

  const bytes: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x7F) {
      bytes.push(code);
      continue;
    }
    if (code >= 0x80 && code <= 0x9F) {
      bytes.push(code);
      continue;
    }
    const byte = cp1251Bytes.get(char);
    if (byte == null) return value;
    bytes.push(byte);
  }

  try {
    const decoded = utf8Decoder.decode(new Uint8Array(bytes));
    if (!decoded || decoded.includes("\uFFFD")) return value;
    return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
  } catch {
    return value;
  }
}

function repairTextNode(node: Text) {
  const fixed = fixMojibakeText(node.nodeValue || "");
  if (fixed !== node.nodeValue) node.nodeValue = fixed;
}

function repairElementAttributes(element: Element) {
  const names = ["placeholder", "title", "aria-label", "alt", "data-placeholder"];
  for (const name of names) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const fixed = fixMojibakeText(value);
    if (fixed !== value) element.setAttribute(name, fixed);
  }
}

function repairNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    repairTextNode(node as Text);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (element.matches("script,style,noscript")) return;

  repairElementAttributes(element);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      repairTextNode(current as Text);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      repairElementAttributes(current as Element);
    }
    current = walker.nextNode();
  }
}

export function installMojibakeRepair() {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  const key = "__streamdeskMojibakeRepairInstalled";
  if ((window as any)[key]) return;
  (window as any)[key] = true;

  const scheduleRepair = (() => {
    const pending = new Set<Node>();
    let scheduled = false;
    return (node: Node) => {
      pending.add(node);
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        const nodes = Array.from(pending);
        pending.clear();
        scheduled = false;
        nodes.forEach(repairNode);
      });
    };
  })();

  if (document.body) scheduleRepair(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        scheduleRepair(mutation.target);
      }
      mutation.addedNodes.forEach((node) => scheduleRepair(node));
      if (mutation.type === "attributes") scheduleRepair(mutation.target);
    }
  });

  const start = () => {
    if (!document.body) return;
    scheduleRepair(document.body);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
      attributeFilter: ["placeholder", "title", "aria-label", "alt", "data-placeholder"],
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
