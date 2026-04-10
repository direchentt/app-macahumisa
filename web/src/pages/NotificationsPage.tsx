import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "../api/client";

type Props = {
  onRead?: () => void;
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function NotificationsPage({ onRead }: Props) {
  const { token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await listNotifications(token);
    setItems(data.notifications);
    onRead?.();
  }, [token, onRead]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoading(false));
  }, [token, load]);

  async function readOne(id: string) {
    if (!token) return;
    await markNotificationRead(token, id);
    await load();
  }

  async function readAll() {
    if (!token) return;
    await markAllNotificationsRead(token);
    await load();
  }

  if (!token) return null;

  return (
    <main style={{ flex: 1, padding: "24px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Avisos</h1>
        {items.some((n) => !n.read_at) && (
          <button
            type="button"
            onClick={() => readAll()}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontWeight: 600,
            }}
          >
            Marcar todas leídas
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: 32, textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
          No tenés avisos todavía.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((n) => (
            <li
              key={n.id}
              style={{
                padding: 18,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: n.read_at ? "var(--bg-elevated)" : "var(--accent-dim)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <p style={{ margin: "0 0 6px", fontWeight: 700 }}>{n.title}</p>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}>{n.body}</p>
                  <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>{fmt(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <button
                    type="button"
                    onClick={() => readOne(n.id)}
                    style={{
                      flexShrink: 0,
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--accent)",
                      color: "#0a0f0d",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    Leído
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
