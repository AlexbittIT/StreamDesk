import { User } from "@shared/schema";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

export class AuthService {
  private static USER_KEY = "streamstudio_user";

  static async login(username: string, password: string): Promise<AuthUser> {
    try {
      const base = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";
      const url = base ? `${base.replace(/\/$/, "")}/api/auth/login` : "/api/auth/login";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await response.json();
      const user = data.user;
      
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      return user;
    } catch (error) {
      throw new Error("Login failed");
    }
  }

  static logout(): void {
    const base = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";
    const url = base ? `${base.replace(/\/$/, "")}/api/auth/logout` : "/api/auth/logout";
    fetch(url, { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem(this.USER_KEY);
  }

  static getCurrentUser(): AuthUser | null {
    try {
      const userStr = localStorage.getItem(this.USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  static isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }

  static hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
  }

  static isAdmin(): boolean {
    return this.hasRole("admin");
  }
}
