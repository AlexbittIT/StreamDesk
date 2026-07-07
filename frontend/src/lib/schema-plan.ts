import { apiUrl } from "@/lib/queryClient";

// Загрузка плана-подложки для схемы подключения.
// PNG/JPEG/SVG уходят на сервер как есть; PDF рендерится в PNG первой страницей (pdfjs) и грузится картинкой.
// Хранилище — общий эндпоинт картинок (/api/equipment/photos/upload, отдаётся из /uploads/**).

export interface UploadedPlan {
  url: string;
  width: number;
  height: number;
}

export function isPlanFile(file: File): boolean {
  return /^image\/(png|jpeg|jpg|svg\+xml)$/.test(file.type) || /\.(png|jpe?g|svg|pdf)$/i.test(file.name) || file.type === "application/pdf";
}

async function uploadImage(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("photo", file, filename);
  const res = await fetch(apiUrl("/api/equipment/photos/upload"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw new Error("Не удалось загрузить файл плана");
  const data = await res.json();
  if (!data?.url) throw new Error("Сервер не вернул ссылку на файл");
  return data.url as string;
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1600, height: img.naturalHeight || 1000 });
    // SVG без внутренних размеров или ошибка чтения — берём разумные значения по умолчанию.
    img.onerror = () => resolve({ width: 1600, height: 1000 });
    img.src = src;
  });
}

async function pdfFirstPageToPng(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const pdfjs = await import("pdfjs-dist");
  // Воркер берём из пакета — vite отдаёт его как URL (без обращения к внешним CDN).
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось подготовить холст для рендера PDF");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) throw new Error("Не удалось преобразовать PDF в изображение");
  return { blob, width: canvas.width, height: canvas.height };
}

/** Загружает файл плана и возвращает url + размеры. PDF конвертируется в PNG на клиенте. */
export async function uploadSchemaPlan(file: File): Promise<UploadedPlan> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const { blob, width, height } = await pdfFirstPageToPng(file);
    const base = file.name.replace(/\.pdf$/i, "") || "plan";
    const url = await uploadImage(blob, `${base}.png`);
    return { url, width, height };
  }
  const url = await uploadImage(file, file.name);
  const size = await readImageSize(apiUrl(url));
  return { url, ...size };
}
