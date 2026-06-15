import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system" | "warm" | "high-contrast" | "sepia";
export type ColorScheme = {
  primary: string;
  secondary: string;
  accent: string;
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
  autoTheme: boolean;
  setAutoTheme: (enabled: boolean) => void;
  customColors: ColorScheme | null;
  setCustomColors: (colors: ColorScheme | null) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  resolvedTheme: "light",
  autoTheme: false,
  setAutoTheme: () => null,
  customColors: null,
  setCustomColors: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "streamstudio-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(storageKey) as Theme | null;
    if (saved && (saved.startsWith("neon") || saved === "neon")) {
      localStorage.setItem(storageKey, "dark");
      return "dark";
    }
    return saved || defaultTheme;
  });
  const [autoTheme, setAutoTheme] = useState<boolean>(
    () => localStorage.getItem(`${storageKey}-auto`) === "true"
  );
  const [customColors, setCustomColors] = useState<ColorScheme | null>(() => {
    const saved = localStorage.getItem(`${storageKey}-colors`);
    return saved ? JSON.parse(saved) : null;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("light");

  // Автоматическое переключение по времени суток
  useEffect(() => {
    if (!autoTheme) return;

    const updateThemeByTime = () => {
      const hour = new Date().getHours();
      const root = window.document.documentElement;
      
      if (hour >= 6 && hour < 20) {
        root.classList.remove("dark");
        root.classList.add("light");
        setResolvedTheme("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
        setResolvedTheme("dark");
      }
    };

    updateThemeByTime();
    const interval = setInterval(updateThemeByTime, 60000); // Проверяем каждую минуту
    return () => clearInterval(interval);
  }, [autoTheme]);

  useEffect(() => {
    if (autoTheme) return; // Если авто-тема включена, не меняем вручную

    const root = window.document.documentElement;

    root.classList.remove("light", "dark", "warm", "high-contrast", "sepia");

    let effectiveTheme: "dark" | "light";

    if (theme === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else if (theme === "warm" || theme === "high-contrast" || theme === "sepia") {
      effectiveTheme = "dark";
      root.classList.add(theme);
    } else {
      effectiveTheme = theme;
    }

    root.classList.add(effectiveTheme);
    setResolvedTheme(effectiveTheme);
    
    // Применяем кастомные цвета, если они заданы
    if (customColors) {
      root.style.setProperty('--primary', customColors.primary);
      root.style.setProperty('--secondary', customColors.secondary);
      root.style.setProperty('--accent', customColors.accent);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--accent');
    }
  }, [theme, autoTheme, customColors]);

  useEffect(() => {
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");
        const newTheme = mediaQuery.matches ? "dark" : "light";
        root.classList.add(newTheme);
        setResolvedTheme(newTheme);
      };
      
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
    resolvedTheme,
    autoTheme,
    setAutoTheme: (enabled: boolean) => {
      localStorage.setItem(`${storageKey}-auto`, String(enabled));
      setAutoTheme(enabled);
    },
    customColors,
    setCustomColors: (colors: ColorScheme | null) => {
      if (colors) {
        localStorage.setItem(`${storageKey}-colors`, JSON.stringify(colors));
      } else {
        localStorage.removeItem(`${storageKey}-colors`);
      }
      setCustomColors(colors);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
