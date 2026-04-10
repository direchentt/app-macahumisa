import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteExpense,
  exportExpensesCsv,
  listBudgets,
  listExpenses,
  listSharedLists,
  getBudgetUsage,
  type BudgetUsage,
  type Expense,
  type ExpenseListQuery,
  type SharedList,
} from "../api/client";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseEditModal } from "../components/ExpenseEditModal";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import { isDashboardWelcomeDismissed, setDashboardWelcomeDismissed } from "../lib/dashboardWelcomeStorage";
import { useToast } from "../contexts/ToastContext";

type Props = {
  onDataChange?: () => void;
  onNavigate?: (view: "budgets" | "goals") => void;
  onOpenTour?: () => void;
};

type DashTab = "month" | "custom" | "overview";

function ymNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function boundsForYm(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
  const to = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
  return { from, to };
}

function labelForYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

const fmtMoney = (amount: string, currency: string) =>
  new Intl.NumberFormat("es", { style: "currency", currency: currency || "USD" }).format(Number(amount));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const fmtDateShort = (iso: string) => new Intl.DateTimeFormat("es", { dateStyle: "short" }).format(new Date(iso));

/** Totales a partir del conjunto ya filtrado (API / pestaña). */
function totalsByCurrency(expenses: Expense[]) {
  const map = new Map<string, { spent: number; income: number }>();
  for (const e of expenses) {
    const cur = e.currency || "USD";
    if (!map.has(cur)) map.set(cur, { spent: 0, income: 0 });
    const bucket = map.get(cur)!;
    const n = Number(e.amount);
    if (e.is_income) bucket.income += n;
    else bucket.spent += n;
  }
  return map;
}

function upcomingDues(expenses: Expense[], days: number) {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 86400000);
  return expenses
    .filter((e) => {
      if (!e.due_date || e.is_income) return false;
      const d = new Date(e.due_date);
      return d >= now && d <= limit;
    })
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
}

export function DashboardPage({ onDataChange, onNavigate, onOpenTour }: Props) {
  const { token, userId } = useAuth();
  const { showToast } = useToast();
  const [welcomeDismissedLocal, setWelcomeDismissedLocal] = useState(false);

  useEffect(() => {
    setWelcomeDismissedLocal(false);
  }, [userId]);

  const showDashboardWelcome =
    Boolean(userId) &&
    !welcomeDismissedLocal &&
    !isDashboardWelcomeDismissed(userId ?? null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [lists, setLists] = useState<SharedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [budgetAlerts, setBudgetAlerts] = useState<{ over: number; usage: BudgetUsage[] }>({ over: 0, usage: [] });

  const [dashTab, setDashTab] = useState<DashTab>("month");
  const [periodYm, setPeriodYm] = useState(ymNow);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [incomeFilter, setIncomeFilter] = useState<"all" | "in" | "out">("all");

  const filtersExtra = Boolean(q.trim() || category.trim() || listFilter || incomeFilter !== "all");
  const filtersActive =
    dashTab === "custom" ? Boolean(filtersExtra || from || to) : filtersExtra;

  const queryParams = useMemo((): ExpenseListQuery => {
    const p: ExpenseListQuery = { limit: 250 };
    if (dashTab === "month" || dashTab === "overview") {
      const { from: f, to: t } = boundsForYm(periodYm);
      p.from = f;
      p.to = t;
    } else {
      if (from) p.from = new Date(from).toISOString();
      if (to) p.to = new Date(to).toISOString();
    }
    if (q.trim()) p.q = q.trim();
    if (category.trim()) p.category = category.trim();
    if (listFilter === "__personal__") p.personal_only = true;
    else if (listFilter) p.shared_list_id = listFilter;
    if (incomeFilter === "in") p.is_income = true;
    if (incomeFilter === "out") p.is_income = false;
    return p;
  }, [dashTab, periodYm, q, from, to, category, listFilter, incomeFilter]);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const [ex, ls] = await Promise.all([listExpenses(token, queryParams), listSharedLists(token)]);
      setExpenses(ex.expenses);
      setLists(ls.shared_lists);
      onDataChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token, queryParams, onDataChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { budgets } = await listBudgets(token);
        const usage: BudgetUsage[] = [];
        let over = 0;
        for (const b of budgets) {
          const u = await getBudgetUsage(token, b.id);
          if (cancelled) return;
          usage.push(u);
          if (u.over_limit) over += 1;
        }
        if (!cancelled) setBudgetAlerts({ over, usage });
      } catch {
        if (!cancelled) setBudgetAlerts({ over: 0, usage: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, expenses.length]);

  const periodLabel = useMemo(() => labelForYm(periodYm), [periodYm]);
  const summaryMap = useMemo(() => totalsByCurrency(expenses), [expenses]);
  const dues = useMemo(() => upcomingDues(expenses, 45), [expenses]);

  const showList = dashTab === "month" || dashTab === "custom";
  const listSlice = dashTab === "overview" ? expenses.slice(0, 8) : expenses;

  async function handleDelete(id: string) {
    if (!token || !confirm("¿Eliminar este movimiento?")) return;
    try {
      await deleteExpense(token, id);
      await load();
      showToast("Movimiento eliminado");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  async function handleExportCsv() {
    if (!token) return;
    try {
      const blob = await exportExpensesCsv(token, {
        q: queryParams.q,
        from: queryParams.from,
        to: queryParams.to,
        category: queryParams.category,
        is_income: queryParams.is_income,
        shared_list_id: queryParams.shared_list_id,
        personal_only: queryParams.personal_only,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "macahumisa-gastos.csv";
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV descargado");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar CSV");
    }
  }

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) {
      showToast("Permití ventanas emergentes para imprimir");
      return;
    }
    const rows = expenses
      .map((row) => {
        const listName = row.shared_list_id ? lists.find((l) => l.id === row.shared_list_id)?.name ?? "—" : "—";
        return `<tr><td>${fmtDate(row.date)}</td><td>${row.is_income ? "+" : "−"} ${fmtMoney(row.amount, row.currency)}</td><td>${row.category ?? "—"}</td><td>${(row.description ?? "—").replace(/</g, "&lt;")}</td><td>${listName}</td></tr>`;
      })
      .join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Movimientos</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:8px;text-align:left} th{background:#eee}</style>
      </head><body><h1>Macahumisa — movimientos</h1><table><thead><tr><th>Fecha</th><th>Importe</th><th>Categoría</th><th>Nota</th><th>Lista</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="color:#666;font-size:12px">Generado ${new Intl.DateTimeFormat("es").format(new Date())}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  if (!token) return null;

  function renderKpiSection() {
    if (summaryMap.size === 0) return null;
    return (
      <section className="dash-kpi-grid" aria-label="Resumen del período">
        {filtersActive && (
          <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Cifras según los movimientos listados (hay filtros activos).
          </p>
        )}
        {[...summaryMap.entries()].map(([currency, { spent, income }]) => {
          const balance = income - spent;
          const suffix = summaryMap.size > 1 ? ` (${currency})` : "";
          const footnote = filtersActive ? "Según filtros activos" : "En el período mostrado";
          const card = (variant: "coral" | "mint" | "blue", label: string, value: string, sub?: string) => (
            <div key={label + currency} className={`dash-kpi dash-kpi--${variant}`}>
              <div className="dash-kpi-color">
                <p className="dash-kpi-label">
                  {label}
                  {suffix}
                </p>
                <p className="dash-kpi-value">{value}</p>
              </div>
              <div className="dash-kpi-pastel">
                <p className={`dash-kpi-sub${sub ? "" : " dash-kpi-sub--muted"}`}>{sub ?? footnote}</p>
              </div>
            </div>
          );
          return (
            <div key={currency} style={{ display: "contents" }}>
              {card("coral", "Gastado", fmtMoney(String(spent), currency))}
              {card("mint", "Ingresos", fmtMoney(String(income), currency))}
              {card(
                "blue",
                "Balance",
                fmtMoney(String(Math.abs(balance)), currency),
                balance >= 0 ? "Ingresos ≥ gastos" : "Gastos mayores a ingresos",
              )}
            </div>
          );
        })}
      </section>
    );
  }

  function renderExpenseRows(rows: Expense[]) {
    return rows.map((row) => {
      const listName = row.shared_list_id ? lists.find((l) => l.id === row.shared_list_id)?.name ?? "—" : "—";
      return (
        <tr key={row.id}>
          <td style={{ whiteSpace: "nowrap" }}>{fmtDate(row.date)}</td>
          <td className={`num ${row.is_income ? "income" : ""}`}>
            {row.is_income ? "+" : "−"} {fmtMoney(row.amount, row.currency)}
          </td>
          <td style={{ color: "var(--text-muted)" }}>{row.category ?? "—"}</td>
          <td style={{ color: "var(--text-muted)", maxWidth: 200 }}>{row.description ?? "—"}</td>
          <td style={{ color: "var(--text-muted)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
            {row.due_date ? fmtDateShort(row.due_date) : "—"}
          </td>
          <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{listName}</td>
          <td>
            <button type="button" className="dash-link-btn" onClick={() => setEditing(row)}>
              Editar
            </button>{" "}
            <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
              Eliminar
            </button>
          </td>
        </tr>
      );
    });
  }

  function renderExpenseCards(rows: Expense[]) {
    return rows.map((row) => {
      const listName = row.shared_list_id ? lists.find((l) => l.id === row.shared_list_id)?.name ?? "—" : "—";
      return (
        <article key={row.id} className="dash-exp-card">
          <div className="dash-exp-card-top">
            <span className="dash-exp-card-date">{fmtDateShort(row.date)}</span>
            <span className={`dash-exp-card-amount ${row.is_income ? "income" : ""}`}>
              {row.is_income ? "+" : "−"} {fmtMoney(row.amount, row.currency)}
            </span>
          </div>
          <p className="dash-exp-card-meta">
            {(row.category ?? "Sin categoría") + (row.description ? ` · ${row.description}` : "")}
          </p>
          <p className="dash-exp-card-meta">
            {listName}
            {row.due_date ? ` · Vence ${fmtDateShort(row.due_date)}` : ""}
          </p>
          <div className="dash-exp-card-actions">
            <button type="button" className="dash-link-btn" onClick={() => setEditing(row)}>
              Editar
            </button>
            <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
              Eliminar
            </button>
          </div>
        </article>
      );
    });
  }

  return (
    <main className="dash-shell">
      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) && <div className="dash-alert dash-alert--error">{err}</div>}

      {showDashboardWelcome && (
        <section className="dash-welcome" aria-labelledby="dash-welcome-title">
          <div className="dash-welcome-top">
            <div>
              <p className="dash-welcome-eyebrow">Empezá tranquilo</p>
              <h2 id="dash-welcome-title" className="dash-welcome-title">
                Tu mes y tus movimientos, en un solo lugar
              </h2>
            </div>
            <div className="dash-welcome-actions">
              {onOpenTour && (
                <button type="button" className="dash-btn dash-btn--primary" onClick={() => onOpenTour()}>
                  Ver tour guiado
                </button>
              )}
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={() => {
                  if (userId) setDashboardWelcomeDismissed(userId);
                  setWelcomeDismissedLocal(true);
                }}
              >
                Entendido, ocultar
              </button>
            </div>
          </div>
          <ul className="dash-welcome-list">
            <li>Usá «Por mes» para el calendario; «Personalizado» si necesitás rangos o más filtros.</li>
            <li>Los presupuestos y las metas están a un clic en la barra superior.</li>
            <li>En el celular, la tabla se convierte en tarjetas para leer más cómodo.</li>
          </ul>
        </section>
      )}

      <div className="dash-hero">
        <div className="dash-title-block">
          <h1>Gastos</h1>
          <p>
            Organizá por mes, explorá con filtros a medida o mirá el resumen. En el celular los movimientos se ven como tarjetas.
          </p>
          <div className="dash-quick-actions">
            {onNavigate && (
              <>
                <button
                  type="button"
                  className={"dash-btn" + (budgetAlerts.over > 0 ? " dash-btn--warn" : "")}
                  onClick={() => onNavigate("budgets")}
                >
                  Presupuestos{budgetAlerts.over > 0 ? ` · ${budgetAlerts.over} sobre tope` : ""}
                </button>
                <button type="button" className="dash-btn" onClick={() => onNavigate("goals")}>
                  Metas de ahorro
                </button>
              </>
            )}
          </div>
        </div>
        <ExpenseForm token={token} lists={lists} onCreated={load} />
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Vista de gastos">
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "month"}
          className="dash-tab"
          onClick={() => setDashTab("month")}
        >
          Por mes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "custom"}
          className="dash-tab"
          onClick={() => setDashTab("custom")}
        >
          Personalizado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "overview"}
          className="dash-tab"
          onClick={() => setDashTab("overview")}
        >
          Resumen
        </button>
      </div>

      {(dashTab === "month" || dashTab === "overview") && (
        <div className="dash-month-bar">
          <button type="button" className="dash-month-nav" aria-label="Mes anterior" onClick={() => setPeriodYm((y) => shiftYm(y, -1))}>
            ‹
          </button>
          <input
            className="dash-month-input"
            type="month"
            value={periodYm}
            onChange={(e) => e.target.value && setPeriodYm(e.target.value)}
            aria-label="Elegir mes"
          />
          <button type="button" className="dash-month-nav" aria-label="Mes siguiente" onClick={() => setPeriodYm((y) => shiftYm(y, 1))}>
            ›
          </button>
        </div>
      )}

      {dashTab === "custom" && (
        <section className="dash-panel">
          <h2 className="dash-panel-title">Filtros avanzados</h2>
          <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Elegí rango de fechas opcional y refiná por texto, categoría, lista o tipo. Sin fechas, se listan los últimos movimientos.
          </p>
          <div className="dash-field-grid">
            <input
              className="dash-input"
              placeholder="Buscar en nota o categoría"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input className="dash-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
            <input className="dash-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
            <input
              className="dash-input"
              placeholder="Categoría exacta"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <select className="dash-select" value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Lista">
              <option value="">Todas las listas</option>
              <option value="__personal__">Solo personales</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="dash-select"
              value={incomeFilter}
              onChange={(e) => setIncomeFilter(e.target.value as typeof incomeFilter)}
              aria-label="Tipo"
            >
              <option value="all">Todos</option>
              <option value="out">Solo gastos</option>
              <option value="in">Solo ingresos</option>
            </select>
          </div>
          <div className="dash-actions-row">
            <button type="button" className="dash-btn dash-btn--primary" onClick={() => void load()}>
              Aplicar filtros
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              onClick={() => {
                setQ("");
                setFrom("");
                setTo("");
                setCategory("");
                setListFilter("");
                setIncomeFilter("all");
              }}
            >
              Limpiar
            </button>
            <button type="button" className="dash-btn" onClick={() => void handleExportCsv()}>
              CSV
            </button>
            <button type="button" className="dash-btn" onClick={handlePrint}>
              Imprimir / PDF
            </button>
          </div>
        </section>
      )}

      {(dashTab === "month" || dashTab === "overview") && (
        <section className="dash-panel" style={{ marginBottom: 16 }}>
          <h2 className="dash-panel-title">Filtros rápidos ({periodLabel})</h2>
          <div className="dash-field-grid">
            <input
              className="dash-input"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input
              className="dash-input"
              placeholder="Categoría"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <select className="dash-select" value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
              <option value="">Todas las listas</option>
              <option value="__personal__">Solo personales</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="dash-select"
              value={incomeFilter}
              onChange={(e) => setIncomeFilter(e.target.value as typeof incomeFilter)}
            >
              <option value="all">Todos</option>
              <option value="out">Gastos</option>
              <option value="in">Ingresos</option>
            </select>
          </div>
          <div className="dash-actions-row">
            <button type="button" className="dash-btn dash-btn--primary" onClick={() => void load()}>
              Actualizar
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              onClick={() => {
                setQ("");
                setCategory("");
                setListFilter("");
                setIncomeFilter("all");
              }}
            >
              Limpiar filtros
            </button>
            <button type="button" className="dash-btn" onClick={() => void handleExportCsv()}>
              CSV
            </button>
            <button type="button" className="dash-btn" onClick={handlePrint}>
              Imprimir
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="dash-loading">Cargando movimientos…</div>
      ) : (
        <>
          {dashTab === "overview" && (
            <p style={{ margin: "0 0 14px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Resumen de <strong style={{ color: "var(--text)" }}>{periodLabel}</strong>
            </p>
          )}

          {dues.length > 0 && (
            <div className="dash-due-banner">
              <strong>Próximos vencimientos (45 días)</strong>
              <ul>
                {dues.map((e) => (
                  <li key={e.id}>
                    {fmtDateShort(e.due_date!)} — {fmtMoney(e.amount, e.currency)}
                    {e.description ? ` · ${e.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {renderKpiSection()}

          {showList && listSlice.length === 0 && (
            <div className="dash-empty">
              <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, fontFamily: "var(--font-display)" }}>Todavía no hay movimientos acá</p>
              <p style={{ margin: "12px 0 0", fontSize: "0.9rem", maxWidth: "22rem", marginLeft: "auto", marginRight: "auto" }}>
                Cambiá el mes con las flechas o el selector, o tocá <strong style={{ color: "var(--cta)" }}>+ Nuevo gasto</strong> para registrar el primero.
              </p>
            </div>
          )}

          {showList && listSlice.length > 0 && (
            <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Importe</th>
                      <th>Categoría</th>
                      <th>Nota</th>
                      <th>Vence</th>
                      <th>Lista</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderExpenseRows(listSlice)}</tbody>
                </table>
              </div>
              <div className="dash-exp-cards">{renderExpenseCards(listSlice)}</div>
            </>
          )}

          {dashTab === "overview" && listSlice.length > 0 && (
            <p style={{ marginTop: 16, fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Mostrando los últimos {listSlice.length} movimientos del mes. Para la lista completa usá la pestaña «Por mes».
            </p>
          )}

          {dashTab === "overview" && listSlice.length === 0 && !loading && (
            <div className="dash-empty">
              <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)" }}>Sin datos en {periodLabel}</p>
              <p style={{ margin: "10px 0 0", fontSize: "0.88rem" }}>En «Por mes» ves el listado completo del mes.</p>
            </div>
          )}
        </>
      )}

      {editing && (
        <ExpenseEditModal token={token} expense={editing} lists={lists} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </main>
  );
}
