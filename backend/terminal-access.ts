/**
 * Кто может просматривать Терминал сервера.
 * Хранится в .terminal-access.json (если нет — из env TERMINAL_ALLOWED_ROLES или по умолчанию admin).
 */

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), ".terminal-access.json");

function readAllowedRoles(): string[] {
  try {
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.allowedRoles)) {
        return data.allowedRoles.filter((r: unknown) => typeof r === "string" && r.trim());
      }
    }
  } catch {
    /* ignore */
  }
  const fromEnv = (process.env.TERMINAL_ALLOWED_ROLES || "admin").trim();
  return fromEnv ? fromEnv.split(",").map((r) => r.trim()).filter(Boolean) : ["admin"];
}

export function getTerminalAllowedRoles(): string[] {
  return readAllowedRoles();
}

export function setTerminalAllowedRoles(roles: string[]): void {
  const normalized = roles.filter((r) => typeof r === "string" && r.trim());
  fs.writeFileSync(FILE, JSON.stringify({ allowedRoles: normalized }, null, 2), "utf8");
}

export function canViewTerminal(userRole: string | undefined): boolean {
  if (!userRole) return false;
  return getTerminalAllowedRoles().includes(userRole);
}
