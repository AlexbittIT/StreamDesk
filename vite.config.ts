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
  // Пре-бандлим тяжёлые PDF-зависимости на старте, чтобы Vite не делал
  // переоптимизацию и полную перезагрузку при первом клике на «PDF».
  optimizeDeps: {
    include: ["jspdf", "html2canvas"],
  },
  root: path.resolve(import.meta.dirname, "frontend"),
  // Пре-бандлим тяжёлые PDF-зависимости на старте, чтобы Vite не делал
  // переоптимизацию и полную перезагрузку при первом клике на «PDF».
  optimizeDeps: {
    include: ["jspdf", "html2canvas"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
