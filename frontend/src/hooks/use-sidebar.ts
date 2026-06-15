import { useState, useEffect } from "react";

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebar_collapsed');
      setCollapsed(saved === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    // Также слушаем изменения через кастомное событие
    window.addEventListener('sidebar-collapse-change', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-collapse-change', handleStorageChange);
    };
  }, []);

  return collapsed;
}

