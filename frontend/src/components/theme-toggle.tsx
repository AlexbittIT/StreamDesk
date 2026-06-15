import { Moon, Sun, Monitor, Sunset, Eye, Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme, autoTheme, setAutoTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full hover:bg-primary/10 transition-all h-9 w-9 sm:h-10 sm:w-10 shrink-0"
          data-testid="button-theme-toggle"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Переключить тему</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-lg w-52 sm:w-56">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Основные темы
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "light" ? "bg-primary/10 text-primary font-medium" : ""
          )}
          data-testid="theme-light"
        >
          <Sun className="mr-2 h-4 w-4" />
          Светлая
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "dark" ? "bg-primary/10 text-primary font-medium" : ""
          )}
          data-testid="theme-dark"
        >
          <Moon className="mr-2 h-4 w-4" />
          Тёмная
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "system" ? "bg-primary/10 text-primary font-medium" : ""
          )}
          data-testid="theme-system"
        >
          <Monitor className="mr-2 h-4 w-4" />
          Системная
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Для зрения
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => setTheme("warm")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "warm" ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 font-medium" : ""
          )}
        >
          <Eye className="mr-2 h-4 w-4" />
          Теплая
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("high-contrast")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "high-contrast" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium" : ""
          )}
        >
          <Contrast className="mr-2 h-4 w-4" />
          Высокий контраст
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("sepia")}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            theme === "sepia" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium" : ""
          )}
        >
          <Eye className="mr-2 h-4 w-4" />
          Сепия
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => setAutoTheme(!autoTheme)}
          className={cn(
            "rounded-lg cursor-pointer transition-all min-h-[44px]",
            autoTheme ? "bg-primary/10 text-primary font-medium" : ""
          )}
        >
          <Sunset className="mr-2 h-4 w-4" />
          Авто по времени суток
          {autoTheme && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
