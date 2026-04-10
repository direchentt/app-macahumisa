import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import { listNotifications } from "./api/client";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { SharedListsPage } from "./pages/SharedListsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Header, type AppView } from "./components/Header";
import { Onboarding } from "./components/Onboarding";
import { isOnboardingComplete, setOnboardingComplete } from "./lib/onboardingStorage";
import { setDashboardWelcomeDismissed } from "./lib/dashboardWelcomeStorage";

export default function App() {
  const { token, userId, ready } = useAuth();
  const [view, setView] = useState<AppView>("dashboard");
  const [unread, setUnread] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const refreshUnread = useCallback(async () => {
    if (!token) {
      setUnread(0);
      return;
    }
    try {
      const n = await listNotifications(token, true);
      setUnread(n.unread_count);
    } catch {
      /* silencioso */
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

  useEffect(() => {
    if (!token) {
      setShowOnboarding(false);
      return;
    }
    if (!userId) return;
    if (!isOnboardingComplete(userId)) setShowOnboarding(true);
  }, [token, userId]);

  const finishOnboarding = useCallback(() => {
    if (userId) {
      setOnboardingComplete(userId);
      setDashboardWelcomeDismissed(userId);
    }
    setShowOnboarding(false);
  }, [userId]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  if (!ready) {
    return (
      <div className="app-boot">
        <p className="app-boot-text">Cargando sesión…</p>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {showOnboarding && <Onboarding onFinish={finishOnboarding} onDismiss={dismissOnboarding} />}
      <Header
        unreadNotifications={unread}
        view={view}
        onNavigate={setView}
        onOpenTour={() => setShowOnboarding(true)}
      />
      <main key={view} className="app-main-surface">
        {view === "dashboard" && (
          <DashboardPage
            onDataChange={refreshUnread}
            onNavigate={(v) => setView(v === "budgets" ? "budgets" : "goals")}
            onOpenTour={() => setShowOnboarding(true)}
          />
        )}
        {view === "notifications" && <NotificationsPage onRead={refreshUnread} />}
        {view === "budgets" && <BudgetsPage />}
        {view === "goals" && <GoalsPage />}
        {view === "lists" && <SharedListsPage />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
