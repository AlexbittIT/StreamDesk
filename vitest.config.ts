import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Отдельный конфиг для тестов фронтенда (Vitest), чтобы не связывать прод-сборку
// (vite.config.ts) с тестовым стеком. Алиасы повторяют vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "frontend", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./frontend/src/test/setup.ts",
    include: ["frontend/src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage/frontend",
      include: ["frontend/src/lib/**/*.ts", "frontend/src/components/**/*.tsx"],
    },
  },
});
