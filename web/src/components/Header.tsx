import { useAuth } from "../contexts/AuthContext";

type Props = {
  unreadNotifications: number;
  view: "dashboard" | "notifications" | "budgets";
  onNavigate: (v: "dashboard" | "notifications" | "budgets") => void;
};

export function Header({ unreadNotifications, view, onNavigate }: Props) {
  const { email, logout } = useAuth();

  const btn = (active: boolean) =>
    ({
      padding: "8px 14px",
      borderRadius: "var(--radius-sm)",
      border: "1px solid " + (active ? "var(--accent)" : "transparent"),
      background: active ? "var(--accent-dim)" : "transparent",
      color: "var(--text)",
      fontWeight: 600,
      fontSize: "0.9rem",
    }) as const;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.02em" }}>Macahumisa</span>
        <nav style={{ display: "flex", gap: 6 }}>
          <button type="button" style={btn(view === "dashboard")} onClick={() => onNavigate("dashboard")}>
            Gastos
          </button>
          <button type="button" style={btn(view === "budgets")} onClick={() => onNavigate("budgets")}>
            Presupuestos
          </button>
          <button type="button" style={btn(view === "notifications")} onClick={() => onNavigate("notifications")}>
            Avisos
            {unreadNotifications > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--accent)",
                  color: "#0a0f0d",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                }}
              >
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{email}</span>
        <button
          type="button"
          onClick={logout}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
          }}
        >
          Salir
        </button>
      </div>
    </header>
  );
}
