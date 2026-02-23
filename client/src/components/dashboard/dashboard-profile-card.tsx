import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function DashboardProfileCard() {
  let user: { name?: string; username?: string; email?: string; avatar?: string; role?: string } | null = null;
  try {
    const saved = localStorage.getItem("streamstudio_user");
    if (saved) user = JSON.parse(saved);
  } catch {}

  if (!user) return null;

  const roleLabel =
    user.role === "admin"
      ? "Администратор"
      : user.role === "manager"
        ? "Менеджер"
        : "Сотрудник";

  return (
    <Card className="bg-card/80 dark:bg-card/90 backdrop-blur-sm border border-border overflow-hidden rounded-xl border-l-4 border-l-primary/60">
      <CardContent className="p-3 sm:p-4 min-w-0">
        <div className="flex items-start gap-3">
          <Avatar className="h-14 w-14 shrink-0 border-2 border-primary/30">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="bg-primary/20 text-primary text-lg">
              {user.name?.split(" ").map((n: string) => n[0]).join("") || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground text-lg truncate">
              {user.name || "Гость"}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {user.email || user.username ? `@${user.username || "user"}` : roleLabel}
            </p>
            {user.email && (
              <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">
                {user.email}
              </p>
            )}
            {!user.email && (
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                {roleLabel}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
