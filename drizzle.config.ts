import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = (process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "").trim() || process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL не задан. Добавьте в .env: DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/streamdesk");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
