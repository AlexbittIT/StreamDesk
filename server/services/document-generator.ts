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

  /**
   * Создает параграфы из транскрипции для DOCX
   */
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
