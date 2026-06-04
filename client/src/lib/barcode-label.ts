import JsBarcode from "jsbarcode";

const SVG_NS = "http://www.w3.org/2000/svg";

export const BARCODE_LABEL_WIDTH = 320;
export const BARCODE_LABEL_HEIGHT = 104;
export const BARCODE_LABEL_BRAND = "отис";

type BarcodeLabelOptions = {
  format?: string;
  brand?: string;
};

const readSize = (value: string | null, fallback: number) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const truncateMiddle = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const left = Math.ceil((maxLength - 1) / 2);
  const right = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, left)}…${value.slice(-right)}`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function sanitizeBarcodeFilePart(value: string | null | undefined) {
  return String(value || "equipment")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "equipment";
}

export function renderCompactBarcodeLabel(
  svg: SVGSVGElement,
  value: string,
  options: BarcodeLabelOptions = {},
) {
  const code = String(value || "").trim();
  if (!code) return;

  const tempSvg = document.createElementNS(SVG_NS, "svg");
  JsBarcode(tempSvg, code, {
    format: options.format ?? "CODE128",
    width: 1.35,
    height: 54,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });

  const sourceWidth = readSize(tempSvg.getAttribute("width"), 240);
  const sourceHeight = readSize(tempSvg.getAttribute("height"), 54);
  const maxBarcodeWidth = BARCODE_LABEL_WIDTH - 34;
  const maxBarcodeHeight = 58;
  const scale = Math.min(maxBarcodeWidth / sourceWidth, maxBarcodeHeight / sourceHeight, 1);
  const barcodeWidth = sourceWidth * scale;
  const barcodeHeight = sourceHeight * scale;
  const barcodeX = (BARCODE_LABEL_WIDTH - barcodeWidth) / 2;
  const barcodeY = 18;

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(BARCODE_LABEL_WIDTH));
  svg.setAttribute("height", String(BARCODE_LABEL_HEIGHT));
  svg.setAttribute("viewBox", `0 0 ${BARCODE_LABEL_WIDTH} ${BARCODE_LABEL_HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Штрихкод ${code}`);
  svg.style.display = "block";
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(BARCODE_LABEL_WIDTH));
  background.setAttribute("height", String(BARCODE_LABEL_HEIGHT));
  background.setAttribute("rx", "6");
  background.setAttribute("fill", "#ffffff");
  svg.appendChild(background);

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", `translate(${barcodeX} ${barcodeY}) scale(${scale})`);
  Array.from(tempSvg.childNodes).forEach((node) => {
    group.appendChild(node.cloneNode(true));
  });
  svg.appendChild(group);

  const overlayLabel = (options.brand ?? BARCODE_LABEL_BRAND).toUpperCase();
  const overlayWidth = 78;
  const overlayHeight = 18;
  const overlayX = (BARCODE_LABEL_WIDTH - overlayWidth) / 2;
  const overlayY = barcodeY + barcodeHeight / 2 - overlayHeight / 2 + 1;

  const overlayRect = document.createElementNS(SVG_NS, "rect");
  overlayRect.setAttribute("x", String(overlayX));
  overlayRect.setAttribute("y", String(overlayY));
  overlayRect.setAttribute("width", String(overlayWidth));
  overlayRect.setAttribute("height", String(overlayHeight));
  overlayRect.setAttribute("rx", "3");
  overlayRect.setAttribute("fill", "#ffffff");
  svg.appendChild(overlayRect);

  const overlayText = document.createElementNS(SVG_NS, "text");
  overlayText.textContent = overlayLabel;
  overlayText.setAttribute("x", String(BARCODE_LABEL_WIDTH / 2));
  overlayText.setAttribute("y", String(overlayY + 12.5));
  overlayText.setAttribute("text-anchor", "middle");
  overlayText.setAttribute("fill", "#111111");
  overlayText.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, sans-serif");
  overlayText.setAttribute("font-size", "10");
  overlayText.setAttribute("font-weight", "700");
  overlayText.setAttribute("letter-spacing", "0");
  svg.appendChild(overlayText);

  const codeText = document.createElementNS(SVG_NS, "text");
  codeText.textContent = truncateMiddle(code, 42);
  codeText.setAttribute("x", String(BARCODE_LABEL_WIDTH / 2));
  codeText.setAttribute("y", "89");
  codeText.setAttribute("text-anchor", "middle");
  codeText.setAttribute("fill", "#111111");
  codeText.setAttribute("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace");
  codeText.setAttribute("font-size", code.length > 32 ? "8" : code.length > 24 ? "9" : "11");
  svg.appendChild(codeText);

}

export function downloadBarcodeLabelPng(svg: SVGSVGElement, fileName: string) {
  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  const scale = 3;

  img.onload = () => {
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    canvas.width = BARCODE_LABEL_WIDTH * scale;
    canvas.height = BARCODE_LABEL_HEIGHT * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BARCODE_LABEL_WIDTH, BARCODE_LABEL_HEIGHT);
    ctx.drawImage(img, 0, 0, BARCODE_LABEL_WIDTH, BARCODE_LABEL_HEIGHT);

    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

export function openBarcodePrintWindow(params: {
  svg: SVGSVGElement;
  title?: string;
  name?: string;
  model?: string;
}) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const svgData = new XMLSerializer().serializeToString(params.svg);
  const title = escapeHtml(params.title || "Печать штрих-кода");
  const name = escapeHtml(params.name || "");
  const model = escapeHtml(params.model || "");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page { size: 78mm 48mm; margin: 4mm; }
          * { box-sizing: border-box; }
          body {
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f4f4f5;
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            color: #111827;
          }
          .sheet {
            width: 70mm;
            padding: 3mm;
            background: #ffffff;
            text-align: center;
            border: 1px solid #d4d4d8;
          }
          .name {
            font-size: 10pt;
            font-weight: 700;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .model {
            min-height: 10pt;
            margin-top: 1mm;
            font-size: 8pt;
            color: #52525b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          svg {
            display: block;
            width: 100%;
            height: auto;
            margin-top: 2mm;
          }
          .no-print {
            position: fixed;
            bottom: 18px;
            left: 50%;
            transform: translateX(-50%);
            border: 0;
            border-radius: 6px;
            padding: 10px 18px;
            color: #ffffff;
            background: #7c3aed;
            cursor: pointer;
            font-weight: 600;
          }
          @media print {
            body { min-height: auto; background: #ffffff; }
            .sheet { border: 0; padding: 0; width: 70mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${name ? `<div class="name">${name}</div>` : ""}
          ${model ? `<div class="model">${model}</div>` : ""}
          ${svgData}
        </div>
        <button class="no-print" onclick="window.print()">Печать</button>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}
