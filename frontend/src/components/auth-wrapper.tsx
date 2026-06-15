import { useCallback } from "react";
import Login from "@/pages/login";

export default function AuthWrapper() {
  const handleLogin = useCallback((userData: any) => {
    if (!userData?.id) return;
    try {
      const userJson = JSON.stringify(userData);
      localStorage.setItem("streamstudio_user", userJson);
      if (localStorage.getItem("streamstudio_user")) {
        const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const invite = search?.get("invite");
        const isPlatformAdmin = Array.isArray(userData?.permissions) && userData.permissions.includes("platform:admin");
        const nextPath = userData.onboardingCompleted === false
          ? invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/onboarding"
          : isPlatformAdmin ? "/platform-admin" : "/";
        setTimeout(() => { window.location.href = nextPath; }, 400);
      }
    } catch (_) {}
  }, []);

  return <Login onLogin={handleLogin} />;
}
