import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import { listNotifications } from "./api/client";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { Header } from "./components/Header";

type View = "dashboard" | "notifications" | "budgets";

export default function App() {
  const { token, ready } = useAuth();
  const [view, setView] = useState<View>("dashboard");
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!token) {
      setUnread(0);
      return;
    }
    try {
      const n = await listNotifications(token, true);
      setUnread(n.unread_count);
    } catch {
      /* silencioso: badge no crítico */
    }
  }, [token]);

  useEffect(() => {
    refreshUnread();
  }, [token, view, refreshUnread]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(refreshUnread, 45_000);
    return () => clearInterval(id);
  }, [token, refreshUnread]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
        }}
      >
        Cargando sesión…
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <Header unreadNotifications={unread} view={view} onNavigate={setView} />
      {view === "dashboard" && <DashboardPage onDataChange={refreshUnread} />}
      {view === "notifications" && <NotificationsPage onRead={refreshUnread} />}
      {view === "budgets" && <BudgetsPage />}
    </div>
  );
}
