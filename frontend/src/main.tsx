import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";
import { apiUrl } from "@/lib/queryClient";
import { installMojibakeRepair } from "@/lib/mojibake";

installMojibakeRepair();

function reportClientRuntimeIssue(title: string, message: string, metadata: Record<string, unknown>) {
  try {
    fetch(apiUrl("/api/platform/incidents/report"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        message,
        type: "bug",
        severity: "medium",
        source: "client-runtime",
        metadata: {
          path: window.location.pathname,
          userAgent: navigator.userAgent,
          ...metadata,
        },
      }),
    }).catch(() => {});
  } catch {
    // Runtime telemetry must never interrupt the app itself.
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif'>Ошибка: элемент #root не найден.</p>";
} else {
  try {
    const root = createRoot(rootEl);
    // StrictMode отключён: в режиме разработки он дважды монтирует компоненты,
    // из‑за чего сбрасываются поля логина/пароля при вводе.
    root.render(<App />);
  } catch (err: any) {
    rootEl.innerHTML = [
      "<div style='padding:2rem;font-family:sans-serif;max-width:600px'>",
      "<h2>Ошибка загрузки приложения</h2>",
      "<pre style='background:#f5f5f5;padding:1rem;overflow:auto'>" + (err?.message || String(err)) + "</pre>",
      "<p>Откройте консоль браузера (F12) для подробностей.</p>",
      "</div>"
    ].join("");
    console.error("StreamDesk render error:", err);
  }
}

// Service Worker отключён: его staleWhileRevalidate отдавал устаревший бандл
// (страница «работала только с F12»). Снимаем регистрацию и чистим кэши —
// это лечит и уже «застрявшие» браузеры при первой свежей загрузке.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportClientRuntimeIssue("Ошибка браузера в интерфейсе", event.message || "window.error", {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : null;
    reportClientRuntimeIssue("Необработанная ошибка интерфейса", reason?.message || String(event.reason || "unhandledrejection"), {
      stack: reason?.stack,
    });
  });
}
