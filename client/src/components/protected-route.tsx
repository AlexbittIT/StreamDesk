import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
  user?: any;
}

export function ProtectedRoute({ children, requiredRole, user }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();

  // Если пользователь не передан, пытаемся получить из localStorage
  const currentUser = user || (() => {
    try {
      const savedUser = localStorage.getItem('streamstudio_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  })();

  if (!currentUser || !currentUser.id) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            <h3 className="text-lg font-semibold mb-2">Требуется авторизация</h3>
            <p className="text-gray-600 mb-4">
              Пожалуйста, войдите в систему для доступа к этой странице.
            </p>
            <Button onClick={() => setLocation("/login")}>
              Войти
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(currentUser.role)) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Card className="max-w-md">
            <CardContent className="py-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <h3 className="text-lg font-semibold mb-2">Доступ запрещён</h3>
              <p className="text-gray-600 mb-4">
                У вас нет прав для просмотра этой страницы.
                Требуется роль: {allowedRoles.join(' или ')}
              </p>
              <Button onClick={() => setLocation("/")}>
                На главную
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  return <>{children}</>;
}

