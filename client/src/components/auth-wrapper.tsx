import { useEffect } from "react";
import Login from "@/pages/login";

// Обертка для страницы логина, которая обновляет страницу после успешного входа
export default function AuthWrapper() {
  const handleLogin = (userData: any) => {
    console.log("[AuthWrapper] handleLogin called with:", userData);
    
    if (!userData || !userData.id) {
      console.error("[AuthWrapper] Invalid user data:", userData);
      return;
    }
    
    try {
      // Убеждаемся, что данные сохранены
      const userJson = JSON.stringify(userData);
      localStorage.setItem('streamstudio_user', userJson);
      
      // Проверяем сохранение
      const saved = localStorage.getItem('streamstudio_user');
      if (!saved) {
        console.error("[AuthWrapper] Failed to save user to localStorage");
        return;
      }
      
      console.log("[AuthWrapper] User saved successfully, redirecting...");
      
      // Полная перезагрузка страницы для загрузки пользователя
      // Используем replace вместо href для избежания истории
      setTimeout(() => {
        console.log("[AuthWrapper] Redirecting to /");
        // Используем полный путь для гарантии
        window.location.href = "/";
      }, 300);
    } catch (error: any) {
      console.error("[AuthWrapper] Error saving user:", error);
    }
  };

  return <Login onLogin={handleLogin} />;
}
