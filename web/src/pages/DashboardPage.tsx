import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { deleteExpense, listExpenses, listSharedLists, type Expense, type SharedList } from "../api/client";
import { ExpenseForm } from "../components/ExpenseForm";

type Props = {
  onDataChange?: () => void;
};

const fmtMoney = (amount: string, currency: string) =>
  new Intl.NumberFormat("es", { style: "currency", currency: currency || "USD" }).format(Number(amount));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function DashboardPage({ onDataChange }: Props) {
  const { token } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [lists, setLists] = useState<SharedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const [ex, ls] = await Promise.all([listExpenses(token), listSharedLists(token)]);
      setExpenses(ex.expenses);
      setLists(ls.shared_lists);
      onDataChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token, onDataChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!token || !confirm("¿Eliminar este movimiento?")) return;
    try {
      await deleteExpense(token, id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  }

  if (!token) return null;

  return (
    <main style={{ flex: 1, padding: "24px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
      {err && (
        <p
          style={{
            padding: 14,
            borderRadius: "var(--radius-sm)",
            background: "rgba(242,139,130,0.12)",
            color: "var(--danger)",
          }}
        >
          {err}
        </p>
      )}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
              marginBottom: 28,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Tus movimientos</h1>
              <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 520 }}>
                Personales y de listas compartidas. Los avisos avisan cuando alguien suma un gasto en una lista.
              </p>
            </div>
            <ExpenseForm token={token} lists={lists} onCreated={load} />
          </div>

          {expenses.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                borderRadius: "var(--radius)",
                border: "1px dashed var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <p style={{ margin: 0, fontSize: "1.05rem" }}>Todavía no hay movimientos</p>
              <p style={{ margin: "12px 0 0", fontSize: "0.9rem" }}>Usá «Nuevo gasto» para el primero.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600 }}>Importe</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600 }}>Categoría</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600 }}>Nota</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600 }}>Lista</th>
                    <th style={{ padding: "12px 16px", width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((row) => {
                    const listName = row.shared_list_id
                      ? lists.find((l) => l.id === row.shared_list_id)?.name ?? "—"
                      : "—";
                    return (
                      <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>{fmtDate(row.date)}</td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: row.is_income ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          {row.is_income ? "+" : "−"} {fmtMoney(row.amount, row.currency)}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{row.category ?? "—"}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted)", maxWidth: 200 }}>
                          {row.description ?? "—"}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          {listName}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              fontSize: "0.8rem",
                              textDecoration: "underline",
                            }}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
