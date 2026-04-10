import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { listBudgets, type Budget } from "../api/client";

const fmt = (amount: string, currency = "USD") =>
  new Intl.NumberFormat("es", { style: "currency", currency }).format(Number(amount));

export function BudgetsPage() {
  const { token } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  if (!token) return null;

  return (
    <main style={{ flex: 1, padding: "24px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Presupuestos</h1>
      <p style={{ margin: "0 0 24px", color: "var(--text-muted)" }}>
        Los límites los gestionás desde la API o futuras pantallas de edición. Acá solo lectura.
      </p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : budgets.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: 32, textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
          No hay presupuestos. Podés crearlos con la API{" "}
          <code style={{ fontSize: "0.85em" }}>POST /api/v1/budgets</code>.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {budgets.map((b) => (
            <li
              key={b.id}
              style={{
                padding: 20,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, textTransform: "capitalize" }}>{b.category}</p>
                <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Período: {b.period}
                  {b.alert_threshold != null && ` · Alerta al ${b.alert_threshold}%`}
                </p>
              </div>
              <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--accent)" }}>
                {fmt(b.limit_amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
