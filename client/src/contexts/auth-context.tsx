import { createContext, useContext, ReactNode } from "react";

interface AuthContextType {
  onLogin: (user: any) => void;
  onLogout: () => void;
  user: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, onLogin, onLogout, user }: { 
  children: ReactNode; 
  onLogin: (user: any) => void;
  onLogout: () => void;
  user: any;
}) {
  return (
    <AuthContext.Provider value={{ onLogin, onLogout, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

