import { Moon, Sun, Monitor, Sparkles, Palette, Droplet, Sunset, Eye, Contrast } from "lucide-react";
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
  const { theme, setTheme, resolvedTheme, autoTheme, setAutoTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative rounded-full hover:bg-primary/10 transition-all"
          data-testid="button-theme-toggle"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 neon:hidden" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 neon:hidden" />
          <Sparkles className="absolute h-5 w-5 hidden neon:block animate-pulse" />
          <span className="sr-only">Переключить тему</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl border-2 shadow-xl w-56">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Основные темы
        </DropdownMenuLabel>
        <DropdownMenuItem 
          onClick={() => setTheme("light")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
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
            "rounded-lg cursor-pointer transition-all",
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
            "rounded-lg cursor-pointer transition-all",
            theme === "system" ? "bg-primary/10 text-primary font-medium" : ""
          )}
          data-testid="theme-system"
        >
          <Monitor className="mr-2 h-4 w-4" />
          Системная
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Неоновые темы
        </DropdownMenuLabel>
        <DropdownMenuItem 
          onClick={() => setTheme("neon")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "neon" ? "bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 text-cyan-300 font-medium" : ""
          )}
          data-testid="theme-neon"
        >
          <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
          Неоновая (классическая)
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("neon-cyan")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "neon-cyan" ? "bg-cyan-500/20 text-cyan-300 font-medium" : ""
          )}
        >
          <Droplet className="mr-2 h-4 w-4" style={{ color: 'hsl(180, 100%, 60%)' }} />
          Неоновая Cyan
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("neon-purple")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "neon-purple" ? "bg-purple-500/20 text-purple-300 font-medium" : ""
          )}
        >
          <Droplet className="mr-2 h-4 w-4" style={{ color: 'hsl(280, 100%, 70%)' }} />
          Неоновая Purple
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("neon-pink")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "neon-pink" ? "bg-pink-500/20 text-pink-300 font-medium" : ""
          )}
        >
          <Droplet className="mr-2 h-4 w-4" style={{ color: 'hsl(320, 100%, 70%)' }} />
          Неоновая Pink
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("neon-rainbow")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "neon-rainbow" ? "bg-gradient-to-r from-cyan-500/20 via-purple-500/20 via-pink-500/20 to-green-500/20 font-medium" : ""
          )}
        >
          <Palette className="mr-2 h-4 w-4 animate-pulse" />
          Неоновая Rainbow
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Темы для зрения
        </DropdownMenuLabel>
        <DropdownMenuItem 
          onClick={() => setTheme("warm")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "warm" ? "bg-orange-500/20 text-orange-300 font-medium" : ""
          )}
        >
          <Eye className="mr-2 h-4 w-4" style={{ color: 'hsl(35, 90%, 65%)' }} />
          Теплая (для зрения)
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("high-contrast")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "high-contrast" ? "bg-blue-500/20 text-blue-300 font-medium" : ""
          )}
        >
          <Contrast className="mr-2 h-4 w-4" style={{ color: 'hsl(210, 100%, 60%)' }} />
          Высокий контраст
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setTheme("sepia")}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
            theme === "sepia" ? "bg-amber-500/20 text-amber-300 font-medium" : ""
          )}
        >
          <Eye className="mr-2 h-4 w-4" style={{ color: 'hsl(35, 60%, 60%)' }} />
          Сепия
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={() => setAutoTheme(!autoTheme)}
          className={cn(
            "rounded-lg cursor-pointer transition-all",
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
