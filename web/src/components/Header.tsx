import { useAuth } from "../contexts/AuthContext";

export type AppView = "dashboard" | "notifications" | "budgets" | "lists" | "goals" | "settings";

type Props = {
  unreadNotifications: number;
  view: AppView;
  onNavigate: (v: AppView) => void;
  onOpenTour?: () => void;
};

const navTitle: Record<AppView, string> = {
  dashboard: "Registrar y ver movimientos personales o de listas",
  budgets: "Topes por categoría y consumo del período",
  lists: "Listas compartidas e invitaciones por email",
  notifications: "Avisos cuando hay actividad en tus listas",
  goals: "Metas de ahorro y progreso",
  settings: "Reglas automáticas, webhook y apariencia",
};

export function Header({ unreadNotifications, view, onNavigate, onOpenTour }: Props) {
  const { email, logout, user, setDarkMode } = useAuth();
  const dark = user?.dark_mode ?? false;

  const navBtn = (v: AppView) => `app-nav-btn${view === v ? " app-nav-btn--active" : ""}`;

  return (
    <header className="app-header">
      <div className="app-header-start">
        <span className="app-header-brand">Macahumisa</span>
        <nav className="app-nav" aria-label="Secciones principales">
          <button type="button" title={navTitle.dashboard} className={navBtn("dashboard")} onClick={() => onNavigate("dashboard")}>
            Gastos
          </button>
          <button type="button" title={navTitle.budgets} className={navBtn("budgets")} onClick={() => onNavigate("budgets")}>
            Presupuestos
          </button>
          <button type="button" title={navTitle.goals} className={navBtn("goals")} onClick={() => onNavigate("goals")}>
            Metas
          </button>
          <button type="button" title={navTitle.lists} className={navBtn("lists")} onClick={() => onNavigate("lists")}>
            Listas
          </button>
          <button type="button" title={navTitle.notifications} className={navBtn("notifications")} onClick={() => onNavigate("notifications")}>
            Avisos
            {unreadNotifications > 0 && (
              <span className="app-nav-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
            )}
          </button>
          <button type="button" title={navTitle.settings} className={navBtn("settings")} onClick={() => onNavigate("settings")}>
            Ajustes
          </button>
        </nav>
      </div>
      <div className="app-header-actions">
        {user && (
          <button
            type="button"
            title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            onClick={() => void setDarkMode(!dark)}
            className="app-icon-btn"
          >
            {dark ? "☀️ Claro" : "🌙 Oscuro"}
          </button>
        )}
        {onOpenTour && (
          <button type="button" onClick={onOpenTour} title="Volver a ver la guía inicial" className="app-icon-btn app-icon-btn--ghost">
            Tour guiado
          </button>
        )}
        <span className="app-user-email">{email}</span>
        <button type="button" onClick={logout} className="app-icon-btn">
          Salir
        </button>
      </div>
    </header>
  );
}
