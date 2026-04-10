import { useCallback, useEffect, useState } from "react";
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

export function HistoryPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const { entries: e } = await listAuditLog(token, { limit: 100 });
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

  if (!token) return null;

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-page-eyebrow">Auditoría</p>
        <h1 className="app-page-title">Historial de cambios</h1>
        <p className="app-page-lead">
          Altas, ediciones y bajas de gastos que podés ver (tuyos y de listas donde participás). En Ajustes podés descargar un
          respaldo JSON completo.
        </p>
      </header>

      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) ? <div className="dash-alert dash-alert--error">{err}</div> : null}

      {loading ? (
        <p className="app-loading-text">Cargando historial…</p>
      ) : entries.length === 0 ? (
        <p className="app-muted">Todavía no hay registros de cambios (o la migración de base aún no se aplicó).</p>
      ) : (
        <ul className="history-audit-list">
          {entries.map((row) => {
            const open = openId === row.id;
            return (
              <li key={row.id} className="history-audit-item">
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
                {open ? (
                  <pre className="history-audit-pre">{formatChangesJson(row.changes)}</pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
