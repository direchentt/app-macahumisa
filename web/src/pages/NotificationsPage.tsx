import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  listNotifications,
  listSharedLists,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "../api/client";

type Props = {
  onRead?: () => void;
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function groupKey(n: Notification): string {
  const raw = n.payload?.shared_list_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "_otros";
}

export function NotificationsPage({ onRead }: Props) {
  const { token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [listNames, setListNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const [data, listsData] = await Promise.all([listNotifications(token), listSharedLists(token)]);
    setItems(data.notifications);
    const map: Record<string, string> = {};
    for (const l of listsData.shared_lists) map[l.id] = l.name;
    setListNames(map);
    onRead?.();
  }, [token, onRead]);

  useEffect(() => {
    if (!token) return;
    load().finally(() => setLoading(false));
  }, [token, load]);

  const grouped = useMemo(() => {
    const m = new Map<string, Notification[]>();
    for (const n of items) {
      const k = groupKey(n);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    const keys = [...m.keys()].sort((a, b) => {
      if (a === "_otros") return 1;
      if (b === "_otros") return -1;
      return (listNames[a] ?? a).localeCompare(listNames[b] ?? b, "es");
    });
    return keys.map((key) => ({ key, notifications: m.get(key)! }));
  }, [items, listNames]);

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
    <main className="notif-page">
      <div className="notif-page-head">
        <div>
          <h1 className="notif-page-title">Avisos</h1>
          <p className="notif-page-lead">Por lista cuando el aviso es de una lista compartida.</p>
        </div>
        {items.some((n) => !n.read_at) && (
          <button type="button" className="notif-read-all" onClick={() => readAll()}>
            Marcar todas leídas
          </button>
        )}
      </div>

      {loading ? (
        <p className="app-loading-text">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="notif-empty">No tenés avisos todavía.</p>
      ) : (
        <div className="notif-groups">
          {grouped.map(({ key, notifications }) => {
            const title =
              key === "_otros" ? "Otros avisos" : `Lista «${listNames[key] ?? "sin nombre"}»`;
            const unread = notifications.filter((n) => !n.read_at).length;
            return (
              <details key={key} className="notif-group" open>
                <summary className="notif-group-summary">
                  <span className="notif-group-title">{title}</span>
                  <span className="notif-group-meta">
                    {notifications.length} · {unread > 0 ? `${unread} sin leer` : "al día"}
                  </span>
                </summary>
                <ul className="notif-group-list">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`notif-card${n.read_at ? " notif-card--read" : ""}`}
                    >
                      <div className="notif-card-inner">
                        <div>
                          <p className="notif-card-title">{n.title}</p>
                          <p className="notif-card-body">{n.body}</p>
                          <p className="notif-card-date">{fmt(n.created_at)}</p>
                        </div>
                        {!n.read_at && (
                          <button type="button" className="notif-card-read" onClick={() => readOne(n.id)}>
                            Leído
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </main>
  );
}
