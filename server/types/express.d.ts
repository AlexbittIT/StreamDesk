import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export {};
