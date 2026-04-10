import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import {
  createBudget,
  deleteBudget,
  getBudgetUsage,
  listBudgets,
  updateBudget,
  type Budget,
  type BudgetUsage,
} from "../api/client";

const fmt = (amount: string, currency = "USD") =>
  new Intl.NumberFormat("es", { style: "currency", currency }).format(Number(amount));

export function BudgetsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [usageById, setUsageById] = useState<Record<string, BudgetUsage>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [alertT, setAlertT] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCat, setEditCat] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editAlert, setEditAlert] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const data = await listBudgets(token);
      setBudgets(data.budgets);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadUsage(id: string) {
    if (!token) return;
    try {
      const u = await getBudgetUsage(token, id);
      setUsageById((prev) => ({ ...prev, [id]: u }));
    } catch {
      /* ignore */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const n = Number(limit.replace(",", "."));
    if (!cat.trim() || Number.isNaN(n) || n <= 0) {
      setErr("Completá categoría e importe límite válido");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let alertVal: number | null | undefined;
      if (alertT.trim() !== "") {
        const x = parseInt(alertT, 10);
        alertVal = Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : null;
      }
      await createBudget(token, {
        category: cat.trim(),
        limit_amount: n,
        period,
        alert_threshold: alertVal,
      });
      setCat("");
      setLimit("");
      setAlertT("");
      await load();
      showToast("Presupuesto creado");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(b: Budget) {
    setEditingId(b.id);
    setEditCat(b.category);
    setEditLimit(b.limit_amount);
    setEditPeriod(b.period);
    setEditAlert(b.alert_threshold != null ? String(b.alert_threshold) : "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingId) return;
    const n = Number(editLimit.replace(",", "."));
    if (!editCat.trim() || Number.isNaN(n) || n <= 0) return;
    try {
      let alertVal: number | null | undefined;
      if (editAlert.trim() !== "") {
        const x = parseInt(editAlert, 10);
        alertVal = Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : null;
      }
      await updateBudget(token, editingId, {
        category: editCat.trim(),
        limit_amount: n,
        period: editPeriod,
        alert_threshold: alertVal,
      });
      setEditingId(null);
      await load();
      setUsageById((prev) => {
        const next = { ...prev };
        delete next[editingId];
        return next;
      });
      showToast("Presupuesto actualizado");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDelete(id: string) {
    if (!token || !confirm("¿Eliminar este presupuesto?")) return;
    try {
      await deleteBudget(token, id);
      await load();
      showToast("Presupuesto eliminado");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  if (!token) return null;

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-page-eyebrow">Control por categoría</p>
        <h1 className="app-page-title">Presupuestos</h1>
        <p className="app-page-lead">
          Límite por categoría y período (<code>monthly</code>, <code>weekly</code>, <code>yearly</code>). El uso se calcula con tus gastos del
          período en UTC.
        </p>
      </header>
      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) && <p className="app-error-banner">{err}</p>}

      <div className="app-panel">
        <div className="app-panel-bar" aria-hidden />
        <form onSubmit={handleCreate} className="app-panel-inner">
          <h2 className="app-panel-title">Nuevo presupuesto</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <input placeholder="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} className="app-field-global" required />
            <input placeholder="Límite" value={limit} onChange={(e) => setLimit(e.target.value)} className="app-field-global" required />
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="app-field-global">
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
              <option value="yearly">Anual</option>
            </select>
            <input
              placeholder="Alerta % (opcional)"
              value={alertT}
              onChange={(e) => setAlertT(e.target.value)}
              className="app-field-global"
              type="number"
              min={0}
              max={100}
            />
          </div>
          <button type="submit" disabled={saving} className="app-btn-pill">
            {saving ? "Guardando…" : "Agregar"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="app-loading-text">Cargando…</p>
      ) : budgets.length === 0 ? (
        <div className="app-empty-card">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Todavía no tenés presupuestos</p>
          <p style={{ margin: "10px 0 0", fontSize: "0.9rem" }}>Creá uno con categoría y tope arriba; después tocá «Ver uso del período».</p>
        </div>
      ) : (
        <ul className="app-card-list">
          {budgets.map((b) => {
            const u = usageById[b.id];
            const isEdit = editingId === b.id;
            return (
              <li key={b.id} className="app-card">
                {isEdit ? (
                  <form onSubmit={saveEdit} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                      <input value={editCat} onChange={(e) => setEditCat(e.target.value)} className="app-field-global" required />
                      <input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="app-field-global" required />
                      <select value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} className="app-field-global">
                        <option value="monthly">Mensual</option>
                        <option value="weekly">Semanal</option>
                        <option value="yearly">Anual</option>
                      </select>
                      <input
                        value={editAlert}
                        onChange={(e) => setEditAlert(e.target.value)}
                        placeholder="% alerta"
                        className="app-field-global"
                        type="number"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button type="submit" className="app-btn-pill app-btn-pill--sm">
                        Guardar
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="app-btn-ghost">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, textTransform: "capitalize" }}>{b.category}</p>
                        <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          Período: {b.period}
                          {b.alert_threshold != null && ` · Alerta al ${b.alert_threshold}%`}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--accent)" }}>{fmt(b.limit_amount)}</p>
                    </div>
                    {u && (
                      <div
                        style={{
                          marginTop: 14,
                          paddingTop: 14,
                          borderTop: "1px solid var(--border)",
                          fontSize: "0.9rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        <p style={{ margin: "0 0 6px" }}>
                          Gastado: <strong style={{ color: "var(--text)" }}>{fmt(u.spent)}</strong> · Restante:{" "}
                          <strong style={{ color: u.over_limit ? "var(--danger)" : "var(--text)" }}>{fmt(u.remaining)}</strong> ·{" "}
                          {u.percent_used}% del límite
                        </p>
                        {u.over_limit && <p style={{ margin: 0, color: "var(--danger)", fontWeight: 600 }}>Superado el límite</p>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => void loadUsage(b.id)} className="app-btn-ghost">
                        {u ? "Actualizar uso" : "Ver uso del período"}
                      </button>
                      <button type="button" onClick={() => startEdit(b)} className="app-btn-ghost">
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "none",
                          background: "transparent",
                          color: "var(--danger)",
                          fontSize: "0.85rem",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
