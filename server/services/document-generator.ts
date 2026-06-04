/**
 * Сервис для генерации документов (DOC и PDF) из транскрипции
 * Graceful degradation: если пакеты не установлены, методы вернут ошибку, но приложение не упадет
 */

import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  speakerLabel?: string;
}

interface TranscriptionData {
  text: string;
  segments?: TranscriptionSegment[];
  language?: string;
}

interface EquipmentPassItem {
  name: string;
  serialNumber?: string | null;
  inventoryNumber?: string | null;
  quantity?: number;
}

interface EquipmentPassData {
  direction: "in" | "out";
  organization?: string;
  owner?: string;
  basis?: string;
  projectName?: string;
  handoffAt?: string;
  returnDate?: string;
  returnTime?: string;
  responsibleName?: string;
  responsiblePhone?: string;
  securityOfficer?: string;
  date?: Date;
  items: EquipmentPassItem[];
}

export class DocumentGenerator {
  /**
   * Генерирует DOCX файл из транскрипции
   */
  async generateDOC(
    transcription: TranscriptionData,
    outputPath: string
  ): Promise<void> {
    try {
      const docxModule = await import("docx");
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxModule;
      
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              // Заголовок
              new Paragraph({
                text: "Транскрипция",
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                text: "",
              }),
              // Основной текст
              ...this.createParagraphsFromTranscription(transcription, { Paragraph, TextRun }),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(outputPath, buffer);
    } catch (error: any) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("docx")) {
        throw new Error("Пакет 'docx' не установлен. Установите его командой: npm install docx");
      }
      throw error;
    }
  }

  /**
   * Генерирует PDF файл из транскрипции
   */
  async generatePDF(
    transcription: TranscriptionData,
    outputPath: string
  ): Promise<void> {
    try {
      const pdfkitModule = await import("pdfkit");
      const PDFDocument = pdfkitModule.default;
      
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50,
          },
        });

        const stream = createWriteStream(outputPath);

        doc.on("end", () => resolve());
        doc.on("error", reject);

        doc.pipe(stream);

        // Заголовок
        doc.fontSize(20).text("Транскрипция", { align: "center" });
        doc.moveDown(2);

        // Основной текст
        if (transcription.segments && transcription.segments.length > 0) {
          // Если есть сегменты с временными метками
          transcription.segments.forEach((segment, index) => {
            const timeStr = this.formatTime(segment.start);
            
            // Если есть спикер, показываем его
            if (segment.speakerLabel) {
              doc.fontSize(11).fillColor("#0066cc").text(segment.speakerLabel, {
                continued: false,
              });
              doc.moveDown(0.2);
            }
            
            doc.fontSize(10).fillColor("#666666").text(`[${timeStr}]`, {
              continued: false,
            });
            doc.fontSize(12).fillColor("#000000").text(segment.text, {
              indent: 20,
            });
            doc.moveDown(0.8);
          });
        } else {
          // Простой текст
          doc.fontSize(12).text(transcription.text, {
            align: "left",
          });
        }

        // Язык, если указан
        if (transcription.language) {
          doc.moveDown();
          doc.fontSize(10).fillColor("#999999").text(
            `Язык: ${transcription.language}`,
            { align: "right" }
          );
        }

        doc.end();
      });
    } catch (error: any) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("pdfkit")) {
        throw new Error("Пакет 'pdfkit' не установлен. Установите его командой: npm install pdfkit");
      }
      throw error;
    }
  }

  async generateEquipmentPassDOCX(data: EquipmentPassData): Promise<Buffer> {
    try {
      const [{ default: JSZip }, xmlJsModule] = await Promise.all([
        import("jszip"),
        import("xml-js"),
      ]);
      const { xml2js, js2xml } = xmlJsModule as {
        xml2js: (xml: string, options: Record<string, unknown>) => any;
        js2xml: (value: any, options: Record<string, unknown>) => string;
      };

      const templateBuffer = await this.loadEquipmentPassTemplate();
      const zip = await JSZip.loadAsync(templateBuffer);
      const documentEntry = zip.file("word/document.xml");
      if (!documentEntry) {
        throw new Error("В шаблоне пропуска не найден файл word/document.xml");
      }

      const documentXml = await documentEntry.async("string");
      const documentJson = xml2js(documentXml, { compact: false });
      const documentRoot = documentJson?.elements?.[0];
      const body = this.findFirstElement(documentRoot, "w:body");
      const bodyElements = Array.isArray(body?.elements) ? body.elements : null;
      if (!bodyElements) {
        throw new Error("Не удалось прочитать содержимое шаблона пропуска");
      }

      const organization = this.normalizePassText(
        data.owner || data.organization,
        "АНО ВО «Университет Иннополис»",
      );
      const basis = this.normalizePassText(
        data.basis,
        data.projectName ? `Работы по проекту "${this.normalizePassText(data.projectName)}"` : "служебная необходимость",
      );
      const responsible = [this.normalizePassText(data.responsibleName), this.normalizePassText(data.responsiblePhone)]
        .filter(Boolean)
        .join(", ");
      const securityOfficer = this.normalizePassText(data.securityOfficer);
      const phone = this.normalizePassText(data.responsiblePhone);
      const passDate = data.date ?? new Date();

      this.applyTemplateParagraphLine(bodyElements[5], organization, "center", 1);
      this.applyTemplateDate(bodyElements[7], passDate);
      this.applyTemplateParagraphValueAfterPrefix(bodyElements[9], basis, 2);
      this.applyTemplateParagraphLine(bodyElements[14], responsible, "left");
      this.applyTemplateItemsTable(bodyElements[11], data.items);
      this.applyApprovalTable(bodyElements[17], securityOfficer, phone);

      zip.file("word/document.xml", js2xml(documentJson, { compact: false, spaces: 0 }));
      return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    } catch (error: any) {
      if (error.code === "ERR_MODULE_NOT_FOUND") {
        throw new Error("Не установлены зависимости для работы с DOCX-шаблоном. Установите пакеты jszip и xml-js.");
      }
      throw error;
    }
  }

  private async loadEquipmentPassTemplate(): Promise<Buffer> {
    const candidatePaths = [
      process.env.EQUIPMENT_PASS_TEMPLATE_PATH,
      path.resolve(process.cwd(), "server/templates/equipment-pass-template.docx"),
      "d:\\Программы\\DISTR_ALL\\DISTR\\FORMS\\Пропуск_на_материальные_ценности_бланк.docx",
    ].filter((value): value is string => Boolean(value));

    for (const candidatePath of candidatePaths) {
      try {
        return await fs.readFile(candidatePath);
      } catch {
        continue;
      }
    }

    throw new Error("Не найден шаблон пропуска на материальные ценности");
  }

  private findFirstElement(node: any, name: string): any | undefined {
    if (!node?.elements) return undefined;
    return node.elements.find((element: any) => element?.name === name);
  }

  private getTextNodes(node: any): any[] {
    const result: any[] = [];

    const visit = (value: any) => {
      if (!value?.elements) return;
      for (const child of value.elements) {
        if (child?.name === "w:t") {
          result.push(child);
        }
        visit(child);
      }
    };

    visit(node);
    return result;
  }

  private getDirectChildren(node: any, name: string): any[] {
    return Array.isArray(node?.elements)
      ? node.elements.filter((child: any) => child?.name === name)
      : [];
  }

  private setTextNode(node: any, value: string) {
    if (!node) return;
    node.elements = [{ type: "text", text: value }];
  }

  private setTextNodesValue(nodes: any[], value: string) {
    if (!nodes.length) return;
    this.setTextNode(nodes[0], value);
    for (let index = 1; index < nodes.length; index += 1) {
      this.setTextNode(nodes[index], "");
    }
  }

  private normalizePassText(value: unknown, fallback = ""): string {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    return normalized || fallback;
  }

  private buildTemplateLine(value: string, length: number, align: "left" | "center" = "left") {
    const cleanValue = this.normalizePassText(value);
    const safeLength = Math.max(length, 1);
    if (!cleanValue) {
      return "_".repeat(safeLength);
    }

    if (cleanValue.length >= safeLength) {
      return cleanValue.slice(0, safeLength);
    }

    const fillerLength = safeLength - cleanValue.length;
    if (align === "center") {
      const left = Math.floor(fillerLength / 2);
      const right = fillerLength - left;
      return `${"_".repeat(left)}${cleanValue}${"_".repeat(right)}`;
    }

    return `${cleanValue}${"_".repeat(fillerLength)}`;
  }

  private applyTemplateParagraphLine(node: any, value: string, align: "left" | "center" = "left", captionNodes = 0) {
    const textNodes = this.getTextNodes(node);
    if (!textNodes.length) return;
    const valueNodes = captionNodes > 0 ? textNodes.slice(0, Math.max(textNodes.length - captionNodes, 1)) : textNodes;
    const templateLength = valueNodes.reduce((total, textNode) => total + String(textNode?.elements?.[0]?.text || "").length, 0);
    this.setTextNodesValue(valueNodes, this.buildTemplateLine(value, templateLength, align));
  }

  private applyTemplateParagraphValueAfterPrefix(node: any, value: string, prefixNodes: number) {
    const textNodes = this.getTextNodes(node);
    const valueNodes = textNodes.slice(prefixNodes);
    if (!valueNodes.length) return;

    const leadingSpace = String(valueNodes[0]?.elements?.[0]?.text || "").startsWith(" ") ? " " : "";
    const templateLength = valueNodes.reduce((total, textNode) => total + String(textNode?.elements?.[0]?.text || "").length, 0);
    const lineValue = leadingSpace + this.buildTemplateLine(value, Math.max(templateLength - leadingSpace.length, 1));
    this.setTextNodesValue(valueNodes, lineValue);
  }

  private applyTemplateDate(node: any, date: Date) {
    const textNodes = this.getTextNodes(node);
    if (textNodes.length < 16) return;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    this.setTextNode(textNodes[4], day);
    this.setTextNode(textNodes[9], month[0]);
    this.setTextNode(textNodes[10], month[1]);
    this.setTextNode(textNodes[13], year.slice(0, 2));
    this.setTextNode(textNodes[14], year[2]);
    this.setTextNode(textNodes[15], year[3]);
  }

  private applyTemplateItemsTable(node: any, items: EquipmentPassItem[]) {
    if (!node?.elements) return;

    const rows = this.getDirectChildren(node, "w:tr");
    if (rows.length < 2) return;

    const templateRow = rows[1];
    const normalizedItems = items.length > 0 ? items : [{ name: "", quantity: 1 }];
    const filledRows = normalizedItems.map((item, index) => {
      const row = JSON.parse(JSON.stringify(templateRow));
      const cells = this.getDirectChildren(row, "w:tc");
      const number = [this.normalizePassText(item.serialNumber), this.normalizePassText(item.inventoryNumber)]
        .filter(Boolean)
        .join(" / ") || "-";

      this.setTextNodesValue(this.getTextNodes(cells[0]), String(index + 1));
      this.setTextNodesValue(this.getTextNodes(cells[1]), this.normalizePassText(item.name, "-"));
      this.setTextNodesValue(this.getTextNodes(cells[2]), number);
      this.setTextNodesValue(this.getTextNodes(cells[3]), String(item.quantity ?? 1));

      return row;
    });

    const nonRows = node.elements.filter((element: any) => element?.name !== "w:tr");
    node.elements = [...nonRows, rows[0], ...filledRows];
  }

  private applyApprovalTable(node: any, securityOfficer: string, phone: string) {
    const rows = this.getDirectChildren(node, "w:tr");
    const approvalRow = rows[0];
    const approvalCell = this.getDirectChildren(approvalRow, "w:tc")[0];
    const paragraphs = this.getDirectChildren(approvalCell, "w:p");
    if (paragraphs.length < 7) return;

    const officerNodes = this.getTextNodes(paragraphs[3]);
    if (officerNodes.length >= 6) {
      const officerLineLength = String(officerNodes[3]?.elements?.[0]?.text || "").length;
      this.setTextNode(officerNodes[3], this.buildTemplateLine(securityOfficer, officerLineLength));
    }

    const phoneNodes = this.getTextNodes(paragraphs[6]);
    if (phoneNodes.length >= 3) {
      const phoneLineLength = phoneNodes
        .slice(1)
        .reduce((total, textNode) => total + String(textNode?.elements?.[0]?.text || "").length, 0);
      this.setTextNodesValue(phoneNodes.slice(1), ` ${this.buildTemplateLine(phone, Math.max(phoneLineLength - 1, 1))}`);
    }
  }

  private createParagraphsFromTranscription(
    transcription: TranscriptionData,
    docxClasses: { Paragraph: any; TextRun: any }
  ): any[] {
    const { Paragraph, TextRun } = docxClasses;
    
    if (transcription.segments && transcription.segments.length > 0) {
      // Если есть сегменты с временными метками
      return transcription.segments.map((segment) => {
        const timeStr = this.formatTime(segment.start);
        const children: any[] = [];
        
        // Если есть спикер, добавляем его
        if (segment.speakerLabel) {
          children.push(
            new TextRun({
              text: `${segment.speakerLabel}: `,
              color: "0066cc",
              size: 22,
              bold: true,
            })
          );
        }
        
        children.push(
          new TextRun({
            text: `[${timeStr}] `,
            color: "666666",
            size: 20,
          }),
          new TextRun({
            text: segment.text,
            size: 24,
          })
        );
        
        return new Paragraph({
          children,
        });
      });
    } else {
      // Простой текст - разбиваем на параграфы по предложениям
      const sentences = transcription.text
        .split(/([.!?]\s+)/)
        .filter((s) => s.trim().length > 0);

      return sentences.map(
        (sentence) =>
          new Paragraph({
            children: [
              new TextRun({
                text: sentence.trim(),
                size: 24,
              }),
            ],
          })
      );
    }
  }

  /**
   * Форматирует время в секундах в строку MM:SS
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

// Экспортируем singleton instance
export const documentGenerator = new DocumentGenerator();
