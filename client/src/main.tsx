import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";

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

// Регистрация Service Worker только если приложение не установлено как PWA (в установленном PWA — не нужен)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true
        || document.referrer.includes('android-app://');
      if (!isStandalone && localStorage.getItem('streamstudio_user')) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    } catch (_) {}
  });
}
