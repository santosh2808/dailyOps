import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import type { User } from "@/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  // `identifier` is whatever the user typed — a username or an email; the
  // backend resolves which one it is (see LoginDto).
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  // Enterprise RBAC helper — checks the current user's computed permission
  // set (never a role name). Usage: hasPermission("Lead", "View").
  hasPermission: (module: string, action: string) => boolean;
  // Force Password Change on First Login — self-service change of the
  // current user's own password. Clears user.mustChangePassword on
  // success so ProtectedRoute stops redirecting to /change-password.
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("dailyops_token")
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<User>("/auth/profile");
        setUser(res.data);
      } catch {
        localStorage.removeItem("dailyops_token");
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [token]);

  async function login(identifier: string, password: string) {
    const res = await api.post("/auth/login", { identifier, password });
    localStorage.setItem("dailyops_token", res.data.accessToken);
    setToken(res.data.accessToken);
    setUser(res.data.user);
  }

  function logout() {
    localStorage.removeItem("dailyops_token");
    setToken(null);
    setUser(null);
  }

  function hasPermission(module: string, action: string): boolean {
    if (!user?.permissions) return false;
    return user.permissions.includes(`${module}.${action}`.toLowerCase());
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api.post("/auth/change-password", { currentPassword, newPassword });
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, logout, hasPermission, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
