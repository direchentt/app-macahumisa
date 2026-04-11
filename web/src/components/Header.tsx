import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  IconBell,
  IconChart,
  IconDayHub,
  IconHistory,
  IconHome,
  IconLogo,
  IconMap,
  IconMenu,
  IconMoon,
  IconSettings,
  IconSignOut,
  IconSun,
  IconTarget,
  IconUsers,
} from "./AppIcons";
import { UserAvatarChip } from "./UserAvatarChip";

export type AppView =
  | "dashboard"
  | "notifications"
  | "budgets"
  | "lists"
  | "goals"
  | "settings"
  | "history"
  | "dayhub";

type Props = {
  unreadNotifications: number;
  view: AppView;
  onNavigate: (v: AppView) => void;
  onOpenTour?: () => void;
};

const navTitle: Record<AppView, string> = {
  dashboard: "Cargar y revisar gastos e ingresos",
  budgets: "Tope por categoría y cuánto llevás",
  lists: "Listas compartidas e invitaciones",
  notifications: "Actividad en tus listas",
  goals: "Objetivos de ahorro",
  settings: "Reglas, webhook, respaldo y tema",
  history: "Cambios en tus movimientos",
  dayhub: "Recordatorios, compras, notas y reparto",
};

const pageHeading: Record<AppView, string> = {
  dashboard: "Inicio",
  budgets: "Presupuestos",
  lists: "Listas",
  notifications: "Avisos",
  goals: "Metas",
  settings: "Ajustes",
  history: "Historial",
  dayhub: "Día a día",
};

export function Header({ unreadNotifications, view, onNavigate, onOpenTour }: Props) {
  const { email, logout, user, setDarkMode } = useAuth();
  const dark = user?.dark_mode ?? false;
  const [moreOpen, setMoreOpen] = useState(false);

  const navBtn = (v: AppView) => `app-nav-pill${view === v ? " app-nav-pill--active" : ""}`;
  const moreTabActive =
    view === "notifications" || view === "settings" || view === "history" || view === "dayhub";

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  function go(v: AppView) {
    onNavigate(v);
    setMoreOpen(false);
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-topbar">
          <div className="app-header-brand-block">
            <span className="app-header-brand">
              <IconLogo className="app-header-logo" />
              <span className="app-header-brand-text">MACAHUMISA</span>
            </span>
            <p className="app-header-page-heading">{pageHeading[view]}</p>
          </div>
          <div className="app-header-actions app-header-actions--top">
            {user && (
              <button
                type="button"
                title={dark ? "Tema claro" : "Tema oscuro"}
                onClick={() => void setDarkMode(!dark)}
                className="app-header-icon-btn"
                aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              >
                {dark ? <IconSun className="app-header-icon-btn__svg" /> : <IconMoon className="app-header-icon-btn__svg" />}
              </button>
            )}
            <div className="app-header-user-pill app-header-user-pill--desktop">
              <UserAvatarChip email={email} avatarSlug={user?.avatar_slug} size="sm" />
              <span className="app-user-email">{email}</span>
            </div>
            <button type="button" onClick={logout} className="app-header-icon-btn app-header-icon-btn--danger" title="Salir" aria-label="Cerrar sesión">
              <IconSignOut className="app-header-icon-btn__svg" />
            </button>
          </div>
        </div>

        <nav className="app-nav-rail" aria-label="Secciones principales">
          <button type="button" title={navTitle.dashboard} className={navBtn("dashboard")} onClick={() => onNavigate("dashboard")}>
            <IconHome className="app-nav-pill__icon" />
            <span>Inicio</span>
          </button>
          <button type="button" title={navTitle.budgets} className={navBtn("budgets")} onClick={() => onNavigate("budgets")}>
            <IconChart className="app-nav-pill__icon" />
            <span>Presupuestos</span>
          </button>
          <button type="button" title={navTitle.goals} className={navBtn("goals")} onClick={() => onNavigate("goals")}>
            <IconTarget className="app-nav-pill__icon" />
            <span>Metas</span>
          </button>
          <button type="button" title={navTitle.history} className={navBtn("history")} onClick={() => onNavigate("history")}>
            <IconHistory className="app-nav-pill__icon" />
            <span>Historial</span>
          </button>
          <button type="button" title={navTitle.lists} className={navBtn("lists")} onClick={() => onNavigate("lists")}>
            <IconUsers className="app-nav-pill__icon" />
            <span>Listas</span>
          </button>
          <button type="button" title={navTitle.dayhub} className={navBtn("dayhub")} onClick={() => onNavigate("dayhub")}>
            <IconDayHub className="app-nav-pill__icon" />
            <span>Día a día</span>
          </button>
          <button type="button" title={navTitle.notifications} className={navBtn("notifications")} onClick={() => onNavigate("notifications")}>
            <IconBell className="app-nav-pill__icon" />
            <span>Avisos</span>
            {unreadNotifications > 0 && (
              <span className="app-nav-pill__badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
            )}
          </button>
          <button type="button" title={navTitle.settings} className={navBtn("settings")} onClick={() => onNavigate("settings")}>
            <IconSettings className="app-nav-pill__icon" />
            <span>Ajustes</span>
          </button>
        </nav>
      </header>

      <nav className="app-bottom-nav" aria-label="Navegación principal">
        <button
          type="button"
          className={`app-bottom-nav__btn${view === "dashboard" ? " app-bottom-nav__btn--active" : ""}`}
          onClick={() => onNavigate("dashboard")}
        >
          <IconHome className="app-bottom-nav__icon" />
          <span>Inicio</span>
        </button>
        <button
          type="button"
          className={`app-bottom-nav__btn${view === "budgets" ? " app-bottom-nav__btn--active" : ""}`}
          onClick={() => onNavigate("budgets")}
        >
          <IconChart className="app-bottom-nav__icon" />
          <span>Presup.</span>
        </button>
        <button
          type="button"
          className={`app-bottom-nav__btn${view === "goals" ? " app-bottom-nav__btn--active" : ""}`}
          onClick={() => onNavigate("goals")}
        >
          <IconTarget className="app-bottom-nav__icon" />
          <span>Metas</span>
        </button>
        <button
          type="button"
          className={`app-bottom-nav__btn${view === "lists" ? " app-bottom-nav__btn--active" : ""}`}
          onClick={() => onNavigate("lists")}
        >
          <IconUsers className="app-bottom-nav__icon" />
          <span>Listas</span>
        </button>
        <button
          type="button"
          className={`app-bottom-nav__btn${moreOpen || moreTabActive ? " app-bottom-nav__btn--active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
        >
          <IconMenu className="app-bottom-nav__icon" />
          <span>Más</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="app-more" role="presentation">
          <button type="button" className="app-more__backdrop" aria-label="Cerrar menú" onClick={() => setMoreOpen(false)} />
          <div className="app-more__sheet" role="dialog" aria-modal="true" aria-labelledby="app-more-title">
            <div className="app-more__grab" aria-hidden />
            <h2 id="app-more-title" className="app-more__title">
              Más opciones
            </h2>
            <div className="app-more__user-row">
              <UserAvatarChip email={email} avatarSlug={user?.avatar_slug} size="md" />
              <p className="app-more__email">{email}</p>
            </div>
            <div className="app-more__actions">
              <button type="button" className="app-more__row" onClick={() => go("dayhub")}>
                <IconDayHub className="app-more__row-icon" />
                <span>Día a día</span>
              </button>
              <button type="button" className="app-more__row" onClick={() => go("notifications")}>
                <IconBell className="app-more__row-icon" />
                <span>Avisos</span>
                {unreadNotifications > 0 ? <span className="app-more__pill">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}
              </button>
              <button type="button" className="app-more__row" onClick={() => go("history")}>
                <IconHistory className="app-more__row-icon" />
                <span>Historial de cambios</span>
              </button>
              <button type="button" className="app-more__row" onClick={() => go("settings")}>
                <IconSettings className="app-more__row-icon" />
                <span>Ajustes</span>
              </button>
              {onOpenTour ? (
                <button
                  type="button"
                  className="app-more__row"
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenTour();
                  }}
                >
                  <IconMap className="app-more__row-icon" />
                  <span>Tour guiado</span>
                </button>
              ) : null}
              <button
                type="button"
                className="app-more__row"
                onClick={() => {
                  void setDarkMode(!dark);
                }}
              >
                {dark ? <IconSun className="app-more__row-icon" /> : <IconMoon className="app-more__row-icon" />}
                <span>{dark ? "Tema claro" : "Tema oscuro"}</span>
              </button>
              <button
                type="button"
                className="app-more__row app-more__row--danger"
                onClick={() => {
                  setMoreOpen(false);
                  logout();
                }}
              >
                <IconSignOut className="app-more__row-icon" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
