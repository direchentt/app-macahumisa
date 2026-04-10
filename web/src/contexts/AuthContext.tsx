import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loginRequest, meRequest, patchMe, registerRequest, type PublicUser } from "../api/client";

const STORAGE_KEY = "macahumisa_token";

type AuthContextValue = {
  token: string | null;
  userId: string | null;
  email: string | null;
  user: PublicUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    avatarSlug?: string | null,
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setDarkMode: (dark: boolean) => Promise<void>;
  setAvatarSlug: (slug: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applyTheme(darkMode: boolean) {
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setUserId(null);
      setEmail(null);
      setUser(null);
      delete document.documentElement.dataset.theme;
      setReady(true);
      return;
    }
    let cancelled = false;
    meRequest(token)
      .then((d) => {
        if (!cancelled) {
          setUserId(d.user.id);
          setEmail(d.user.email);
          setUser(d.user);
          applyTheme(d.user.dark_mode);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUserId(null);
          setEmail(null);
          setUser(null);
          delete document.documentElement.dataset.theme;
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
    setUserId(data.user.id);
    setEmail(data.user.email);
    setUser(null);
    setToken(data.access_token);
  }, []);

  const register = useCallback(async (e: string, p: string, firstName?: string, lastName?: string, avatarSlug?: string | null) => {
    const data = await registerRequest(e, p, firstName, lastName, avatarSlug ?? undefined);
    localStorage.setItem(STORAGE_KEY, data.access_token);
    setUserId(data.user.id);
    setEmail(data.user.email);
    setUser(null);
    setToken(data.access_token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUserId(null);
    setEmail(null);
    setUser(null);
    delete document.documentElement.dataset.theme;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const d = await meRequest(token);
    setUser(d.user);
    setUserId(d.user.id);
    setEmail(d.user.email);
    applyTheme(d.user.dark_mode);
  }, [token]);

  const setDarkMode = useCallback(
    async (dark: boolean) => {
      if (!token) return;
      const d = await patchMe(token, { dark_mode: dark });
      setUser(d.user);
      applyTheme(d.user.dark_mode);
    },
    [token],
  );

  const setAvatarSlug = useCallback(
    async (slug: string | null) => {
      if (!token) return;
      const d = await patchMe(token, { avatar_slug: slug });
      setUser(d.user);
    },
    [token],
  );

  const value: AuthContextValue = {
    token,
    userId,
    email,
    user,
    ready,
    login,
    register,
    logout,
    refreshUser,
    setDarkMode,
    setAvatarSlug,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
