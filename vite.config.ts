import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      fastRefresh: false,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "frontend", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "frontend"),
  // Пре-бандлим тяжёлые PDF-зависимости на старте, чтобы Vite не делал
  // переоптимизацию и полную перезагрузку при первом клике на «PDF».
  optimizeDeps: {
    include: ["jspdf", "html2canvas"],
    // Node-only канвас pdfjs в браузере не нужен (используется DOM canvas).
    exclude: ["@napi-rs/canvas"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      // pdfjs подтягивает @napi-rs/canvas только в Node-ветке (dynamic import под isNodeJS).
      // Для браузерной сборки помечаем как external, чтобы не тянуть нативные бинарники
      // и чтобы сборка не падала, когда optional-зависимости не установлены (npm ci --omit=optional).
      external: ["@napi-rs/canvas"],
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
