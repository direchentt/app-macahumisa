import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loginRequest, meRequest, registerRequest } from "../api/client";

const STORAGE_KEY = "macahumisa_token";

type AuthContextValue = {
  token: string | null;
  userId: string | null;
  email: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setUserId(null);
      setEmail(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    meRequest(token)
      .then((d) => {
        if (!cancelled) {
          setUserId(d.user.id);
          setEmail(d.user.email);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUserId(null);
          setEmail(null);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (e: string, p: string) => {
    const data = await loginRequest(e, p);
    localStorage.setItem(STORAGE_KEY, data.access_token);
    setToken(data.access_token);
    setUserId(data.user.id);
    setEmail(data.user.email);
  }, []);

  const register = useCallback(async (e: string, p: string, firstName?: string, lastName?: string) => {
    const data = await registerRequest(e, p, firstName, lastName);
    localStorage.setItem(STORAGE_KEY, data.access_token);
    setToken(data.access_token);
    setUserId(data.user.id);
    setEmail(data.user.email);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUserId(null);
    setEmail(null);
  }, []);

  const value: AuthContextValue = {
    token,
    userId,
    email,
    ready,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
