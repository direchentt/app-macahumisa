import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import {
  createSavingsGoal,
  deleteSavingsGoal,
  listSavingsGoals,
  updateSavingsGoal,
  type SavingsGoal,
} from "../api/client";
import { savingsGoalInsight } from "../lib/savingsGoalInsight";

const fmt = (n: string, c: string) =>
  new Intl.NumberFormat("es", { style: "currency", currency: c || "USD" }).format(Number(n));

export function GoalsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const d = await listSavingsGoals(token);
      setGoals(d.goals);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const t = Number(target.replace(",", "."));
    const s = saved.trim() === "" ? 0 : Number(saved.replace(",", "."));
    if (!name.trim() || Number.isNaN(t) || t <= 0) {
      setErr("Nombre e importe objetivo válidos");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createSavingsGoal(token, {
        name: name.trim(),
        target_amount: t,
        saved_amount: Number.isNaN(s) ? 0 : Math.max(0, s),
        currency: currency.toUpperCase().slice(0, 3),
        deadline: deadline.trim() || null,
      });
      setName("");
      setTarget("");
      setSaved("");
      setDeadline("");
      await load();
      showToast("Meta creada");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function bumpSaved(g: SavingsGoal, delta: number) {
    if (!token) return;
    const cur = Number(g.saved_amount);
    const next = Math.max(0, cur + delta);
    try {
      await updateSavingsGoal(token, g.id, { saved_amount: next });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  async function handleDelete(id: string) {
    if (!token || !confirm("¿Eliminar esta meta?")) return;
    try {
      await deleteSavingsGoal(token, id);
      await load();
      showToast("Meta eliminada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  if (!token) return null;

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-page-eyebrow">Ahorro</p>
        <h1 className="app-page-title">Metas de ahorro</h1>
        <p className="app-page-lead">Marcá cuánto querés juntar y actualizá el ahorrado a mano. El ritmo vs. fecha es orientativo.</p>
      </header>
      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) && <p className="app-error-banner">{err}</p>}

      <div className="app-panel">
        <div className="app-panel-bar app-panel-bar--goals" aria-hidden />
        <form onSubmit={handleCreate} className="app-panel-inner">
          <h2 className="app-panel-title">Nueva meta</h2>
          <input placeholder="Nombre (ej. Vacaciones)" value={name} onChange={(e) => setName(e.target.value)} required className="app-field-global" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 10 }}>
            <label>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Objetivo</span>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" required className="app-field-global" style={{ marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Ya ahorrado (opc.)</span>
              <input value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" className="app-field-global" style={{ marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Moneda</span>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                className="app-field-global"
                style={{ marginTop: 4 }}
              />
            </label>
          </div>
          <label>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Fecha límite (opcional)</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="app-field-global" style={{ marginTop: 4 }} />
          </label>
          <button type="submit" disabled={saving} className="app-btn-pill">
            {saving ? "Guardando…" : "Crear meta"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="app-loading-text">Cargando…</p>
      ) : goals.length === 0 ? (
        <div className="app-empty-card">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Sin metas todavía</p>
          <p style={{ margin: "10px 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>Completá el formulario de arriba y guardá.</p>
        </div>
      ) : (
        <ul className="app-card-list">
          {goals.map((g) => {
            const pct = Math.min(100, (Number(g.saved_amount) / Number(g.target_amount)) * 100);
            const insight = savingsGoalInsight(g);
            return (
              <li key={g.id} className="app-card app-card--goals">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: "1.05rem" }}>{g.name}</strong>
                    <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      {fmt(g.saved_amount, g.currency)} de {fmt(g.target_amount, g.currency)}
                      {g.deadline && ` · límite ${g.deadline}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    style={{ border: "none", background: "transparent", color: "var(--danger)", textDecoration: "underline", fontSize: "0.85rem", cursor: "pointer" }}
                  >
                    Eliminar
                  </button>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    height: 10,
                    borderRadius: 999,
                    background: "var(--surface)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand-mint)", transition: "width 0.3s ease" }} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>{pct.toFixed(0)}% del objetivo</p>
                {insight ? (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color:
                        insight === "Buen ritmo vs. plazo"
                          ? "var(--brand-mint)"
                          : insight === "Ritmo por debajo del plazo" || insight === "Meta vencida sin completar"
                            ? "var(--danger)"
                            : "var(--text-muted)",
                    }}
                  >
                    {insight}
                  </p>
                ) : g.deadline ? (
                  <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Ritmo acorde al plazo (estimado).
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => bumpSaved(g, 500)} className="app-btn-ghost">
                    +500
                  </button>
                  <button type="button" onClick={() => bumpSaved(g, 1000)} className="app-btn-ghost">
                    +1000
                  </button>
                  <button type="button" onClick={() => bumpSaved(g, -500)} className="app-btn-ghost">
                    −500
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
