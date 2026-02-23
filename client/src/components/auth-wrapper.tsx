import { useCallback } from "react";
import Login from "@/pages/login";

export default function AuthWrapper() {
  const handleLogin = useCallback((userData: any) => {
    if (!userData?.id) return;
    try {
      const userJson = JSON.stringify(userData);
      localStorage.setItem("streamstudio_user", userJson);
      if (localStorage.getItem("streamstudio_user")) {
        setTimeout(() => { window.location.href = "/"; }, 400);
      }
    } catch (_) {}
  }, []);

  return <Login onLogin={handleLogin} />;
}
