import React from "react";

export default function Footer() {
  const version = (import.meta as any).env?.VITE_APP_VERSION || 'dev';
  return (
    <footer className="border-t border-border p-3 sm:p-4 bg-card/60 backdrop-blur-sm text-sm text-muted-foreground">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="truncate">© StreamDesk</div>
        <div className="text-xs text-muted-foreground truncate">v{version}</div>
      </div>
    </footer>
  );
}
