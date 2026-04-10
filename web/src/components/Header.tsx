import { useAuth } from "../contexts/AuthContext";
import {
  IconBell,
  IconChart,
  IconLogo,
  IconMap,
  IconMoon,
  IconSettings,
  IconSignOut,
  IconSun,
  IconTarget,
  IconUsers,
  IconWallet,
} from "./AppIcons";

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
        <span className="app-header-brand">
          <IconLogo className="app-header-logo" />
          Macahumisa
        </span>
        <nav className="app-nav" aria-label="Secciones principales">
          <button type="button" title={navTitle.dashboard} className={navBtn("dashboard")} onClick={() => onNavigate("dashboard")}>
            <IconWallet className="app-nav-icon" />
            <span>Gastos</span>
          </button>
          <button type="button" title={navTitle.budgets} className={navBtn("budgets")} onClick={() => onNavigate("budgets")}>
            <IconChart className="app-nav-icon" />
            <span>Presupuestos</span>
          </button>
          <button type="button" title={navTitle.goals} className={navBtn("goals")} onClick={() => onNavigate("goals")}>
            <IconTarget className="app-nav-icon" />
            <span>Metas</span>
          </button>
          <button type="button" title={navTitle.lists} className={navBtn("lists")} onClick={() => onNavigate("lists")}>
            <IconUsers className="app-nav-icon" />
            <span>Listas</span>
          </button>
          <button type="button" title={navTitle.notifications} className={navBtn("notifications")} onClick={() => onNavigate("notifications")}>
            <IconBell className="app-nav-icon" />
            <span>Avisos</span>
            {unreadNotifications > 0 && (
              <span className="app-nav-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
            )}
          </button>
          <button type="button" title={navTitle.settings} className={navBtn("settings")} onClick={() => onNavigate("settings")}>
            <IconSettings className="app-nav-icon" />
            <span>Ajustes</span>
          </button>
        </nav>
      </div>
      <div className="app-header-actions">
        {user && (
          <button
            type="button"
            title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            onClick={() => void setDarkMode(!dark)}
            className="app-icon-btn app-icon-btn--icon-label"
          >
            {dark ? <IconSun className="app-icon-btn-svg" /> : <IconMoon className="app-icon-btn-svg" />}
            <span>{dark ? "Claro" : "Oscuro"}</span>
          </button>
        )}
        {onOpenTour && (
          <button type="button" onClick={onOpenTour} title="Volver a ver la guía inicial" className="app-icon-btn app-icon-btn--ghost app-icon-btn--icon-label">
            <IconMap className="app-icon-btn-svg" />
            <span>Tour</span>
          </button>
        )}
        <span className="app-user-email">{email}</span>
        <button type="button" onClick={logout} className="app-icon-btn app-icon-btn--icon-label" title="Cerrar sesión">
          <IconSignOut className="app-icon-btn-svg" />
          <span>Salir</span>
        </button>
      </div>
    </header>
  );
}
