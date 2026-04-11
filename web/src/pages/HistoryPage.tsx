import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { listAuditLog, type AuditLogEntry } from "../api/client";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";

const actionLabel: Record<string, string> = {
  create: "Alta",
  update: "Edición",
  delete: "Baja",
};

function fmtWhen(iso: string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function formatChangesJson(changes: unknown): string {
  try {
    return JSON.stringify(changes, null, 2);
  } catch {
    return String(changes);
  }
}

type HistoryFilter = "all" | "mine" | "others";

type Props = {
  focusExpenseId?: string | null;
  onClearFocus?: () => void;
};

export function HistoryPage({ focusExpenseId, onClearFocus }: Props) {
  const { token, userId } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [q, setQ] = useState("");
  const focusRef = useRef<HTMLLIElement | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const { entries: e } = await listAuditLog(token, { limit: 300 });
      setEntries(e);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = entries;
    if (focusExpenseId) {
      rows = rows.filter((r) => r.entity_id === focusExpenseId);
    }
    if (filter === "mine" && userId) {
      rows = rows.filter((r) => r.actor_user_id === userId);
    }
    if (filter === "others" && userId) {
      rows = rows.filter((r) => r.actor_user_id !== userId);
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.summary.toLowerCase().includes(needle) ||
          r.entity_id.toLowerCase().includes(needle) ||
          (r.actor_email ?? "").toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [entries, filter, userId, focusExpenseId, q]);

  useEffect(() => {
    if (!focusExpenseId || filtered.length === 0) return;
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    return () => clearTimeout(t);
  }, [focusExpenseId, filtered.length]);

  if (!token) return null;

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-page-eyebrow">Auditoría</p>
        <h1 className="app-page-title">Historial de cambios</h1>
        <p className="app-page-lead">
          Quién creó, editó o borró cada gasto que ves (tuyo o de listas). Filtrá por autor o buscá. Desde Inicio, «Historial» en
          una fila acota a ese movimiento. Respaldo completo: Ajustes.
        </p>
      </header>

      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) ? <div className="dash-alert dash-alert--error">{err}</div> : null}

      {focusExpenseId ? (
        <div className="history-focus-banner">
          <p>
            Solo este movimiento: <code>{focusExpenseId}</code>
          </p>
          {onClearFocus ? (
            <button type="button" className="dash-btn dash-btn--ghost" onClick={() => onClearFocus()}>
              Ver todo
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="history-toolbar" aria-label="Filtros del historial">
        <div className="history-filter-pills" role="group" aria-label="Quién hizo el cambio">
          {(
            [
              ["all", "Todos"],
              ["mine", "Mis acciones"],
              ["others", "Cambios de otros"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`history-filter-pill${filter === k ? " history-filter-pill--active" : ""}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="history-search"
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en historial"
        />
      </section>

      {loading ? (
        <p className="app-loading-text">Cargando historial…</p>
      ) : filtered.length === 0 ? (
        <p className="app-muted">
          {focusExpenseId
            ? "No hay registros recientes para este movimiento (puede estar fuera del límite de 300 entradas o aún no hubo cambios)."
            : entries.length === 0
              ? "Todavía no hay registros de cambios (o la migración de base aún no se aplicó)."
              : "Nada coincide con los filtros."}
        </p>
      ) : (
        <ul className="history-audit-list">
          {filtered.map((row) => {
            const open = openId === row.id;
            const highlight = focusExpenseId && row.entity_id === focusExpenseId;
            return (
              <li
                key={row.id}
                ref={highlight ? focusRef : undefined}
                className={`history-audit-item${highlight ? " history-audit-item--focus" : ""}`}
              >
                <div className="history-audit-item-top">
                  <span className={`history-audit-pill history-audit-pill--${row.action}`}>
                    {actionLabel[row.action] ?? row.action}
                  </span>
                  <time dateTime={row.created_at}>{fmtWhen(row.created_at)}</time>
                </div>
                <p className="history-audit-summary">{row.summary}</p>
                <p className="history-audit-meta">
                  {row.actor_email ?? "Usuario"} · id movimiento <code className="history-audit-code">{row.entity_id}</code>
                </p>
                <button
                  type="button"
                  className="history-audit-toggle"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  {open ? "Ocultar detalle" : "Ver detalle técnico"}
                </button>
                {open ? <pre className="history-audit-pre">{formatChangesJson(row.changes)}</pre> : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
