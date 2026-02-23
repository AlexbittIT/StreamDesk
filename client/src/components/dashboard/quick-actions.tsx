import { Button } from "@/components/ui/button";
import { Video, Package, CalendarPlus, ListTodo } from "lucide-react";
import { Link } from "wouter";

export default function QuickActions() {
  const actions = [
    {
      title: "Новый стрим",
      icon: Video,
      href: "/streams",
      gradient: "from-red-500 to-pink-500",
      glow: "hover:shadow-red-500/25"
    },
    {
      title: "Техника",
      icon: Package,
      href: "/equipment",
      gradient: "from-amber-500 to-orange-500",
      glow: "hover:shadow-amber-500/25"
    },
    {
      title: "Событие",
      icon: CalendarPlus,
      href: "/calendar",
      gradient: "from-violet-500 to-purple-500",
      glow: "hover:shadow-violet-500/25"
    },
    {
      title: "Задачи",
      icon: ListTodo,
      href: "/tasks",
      gradient: "from-cyan-500 to-blue-500",
      glow: "hover:shadow-cyan-500/25"
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <Link key={index} href={action.href}>
            <Button
              variant="outline"
              className={`
                w-full flex flex-col items-center justify-center gap-1 p-2.5 h-auto min-h-0
                bg-white dark:bg-slate-800/90
                border-slate-200 dark:border-slate-700
                hover:border-slate-300 dark:hover:border-slate-600
                transition-all duration-200
                hover:shadow-md ${action.glow}
                group
              `}
              data-testid={`quick-action-${index}`}
            >
              <div className={`
                w-8 h-8 rounded-md flex items-center justify-center shrink-0
                bg-gradient-to-br ${action.gradient}
                group-hover:scale-105 transition-transform
              `}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{action.title}</span>
            </Button>
          </Link>
        );
      })}
    </div>
  );
}
