import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  ApiError,
  createExpense,
  deleteExpense,
  exportExpensesCsv,
  listBudgets,
  listCategoryRules,
  listExpenses,
  listSavingsGoals,
  listSharedLists,
  listReminders,
  listShoppingItems,
  getBudgetUsage,
  NetworkFailure,
  updateExpense,
  type BudgetUsage,
  type CategoryRule,
  type Expense,
  type ExpenseListQuery,
  type SavingsGoal,
  type SharedList,
} from "../api/client";
import { findMatchingCategoryRule } from "../lib/categoryRuleMatch";
import { savingsGoalInsight } from "../lib/savingsGoalInsight";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseEditModal } from "../components/ExpenseEditModal";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import { isDashboardWelcomeDismissed, setDashboardWelcomeDismissed } from "../lib/dashboardWelcomeStorage";
import { useToast } from "../contexts/ToastContext";
import {
  buildDisplayExpenses,
  enqueueQueued,
  expenseQueryKey,
  loadDashboardCache,
  listPendingOps,
  removePending,
  saveDashboardCache,
  type QueuedItem,
} from "../lib/offlineDb";

type Props = {
  onDataChange?: () => void;
  onNavigate?: (view: "budgets" | "goals") => void;
  onOpenTour?: () => void;
  onOpenDayHub?: () => void;
  onOpenHistoryForExpense?: (expenseId: string) => void;
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

export function DashboardPage({
  onDataChange,
  onNavigate,
  onOpenTour,
  onOpenDayHub,
  onOpenHistoryForExpense,
}: Props) {
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
  const [pendingOps, setPendingOps] = useState<QueuedItem[]>([]);
  const [dataFromCache, setDataFromCache] = useState(false);
  const [lists, setLists] = useState<SharedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [budgetAlerts, setBudgetAlerts] = useState<{ over: number; usage: BudgetUsage[] }>({ over: 0, usage: [] });
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [prevMonthSummary, setPrevMonthSummary] = useState<{
    label: string;
    map: Map<string, { spent: number; income: number }>;
    count: number;
  } | null>(null);

  const [dashTab, setDashTab] = useState<DashTab>("month");
  const [periodYm, setPeriodYm] = useState(ymNow);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [incomeFilter, setIncomeFilter] = useState<"all" | "in" | "out">("all");
  const [dayHubPeek, setDayHubPeek] = useState<{ remindersSoon: number; shoppingOpen: number } | null>(null);

  const filtersExtra = Boolean(q.trim() || category.trim() || listFilter || incomeFilter !== "all");
  const filtersActive =
    dashTab === "custom" ? Boolean(filtersExtra || from || to) : filtersExtra;

  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPendingOps([]);
      return;
    }
    setPendingOps(await listPendingOps(userId));
  }, [userId]);

  useEffect(() => {
    if (!token) {
      setDayHubPeek(null);
      return;
    }
    const auth = token;
    let cancelled = false;
    async function peek() {
      try {
        const [re, sh] = await Promise.all([listReminders(auth), listShoppingItems(auth, null)]);
        if (cancelled) return;
        const now = Date.now();
        const weekAhead = now + 7 * 86400000;
        const remindersSoon = re.reminders.filter((x) => new Date(x.remind_at).getTime() <= weekAhead).length;
        const shoppingOpen = sh.items.filter((i) => !i.done).length;
        setDayHubPeek({ remindersSoon, shoppingOpen });
      } catch {
        if (!cancelled) setDayHubPeek(null);
      }
    }
    void peek();
    const onVis = () => {
      if (document.visibilityState === "visible") void peek();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token]);

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
    setDataFromCache(false);
    try {
      const [ex, ls] = await Promise.all([listExpenses(token, queryParams), listSharedLists(token)]);
      setExpenses(ex.expenses);
      setLists(ls.shared_lists);
      if (userId) {
        await saveDashboardCache({
          userId,
          queryKey: expenseQueryKey(queryParams),
          expenses: ex.expenses,
          lists: ls.shared_lists,
          savedAt: new Date().toISOString(),
        });
      }
      onDataChange?.();
    } catch (e) {
      if (e instanceof NetworkFailure && userId) {
        const cached = await loadDashboardCache(userId);
        const qk = expenseQueryKey(queryParams);
        if (cached && cached.queryKey === qk) {
          setExpenses(cached.expenses);
          setLists(cached.lists);
          setDataFromCache(true);
          setErr(null);
        } else if (cached) {
          setExpenses([]);
          setLists(cached.lists);
          setDataFromCache(true);
          setErr(
            "Sin conexión: la última copia en este dispositivo es de otra vista o filtros. Ajustá la vista o esperá conexión.",
          );
        } else {
          setErr(e.message);
        }
      } else {
        setErr(e instanceof Error ? e.message : "Error al cargar");
      }
    } finally {
      setLoading(false);
    }
  }, [token, queryParams, onDataChange, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const syncPendingQueue = useCallback(async () => {
    if (!token || !userId) return;
    const items = await listPendingOps(userId);
    if (items.length === 0) return;
    let ok = 0;
    for (const item of items) {
      try {
        if (item.op === "create") {
          await createExpense(token, { ...item.body, force_duplicate: false });
          await removePending(item.localId);
          ok += 1;
        } else if (item.op === "update") {
          await updateExpense(token, item.expenseId, item.body);
          await removePending(item.localId);
          ok += 1;
        } else {
          await deleteExpense(token, item.expenseId);
          await removePending(item.localId);
          ok += 1;
        }
      } catch (err) {
        if (item.op === "create" && err instanceof ApiError && err.status === 409) {
          const cont = window.confirm(
            "Un movimiento en cola podría ser duplicado de uno del mismo día. ¿Subirlo igual?",
          );
          if (cont) {
            try {
              await createExpense(token, { ...item.body, force_duplicate: true });
              await removePending(item.localId);
              ok += 1;
              continue;
            } catch {
              break;
            }
          }
        }
        break;
      }
    }
    if (ok > 0) {
      showToast(ok === items.length ? "Cola sincronizada con el servidor" : `Procesados ${ok} de ${items.length} en cola`);
      await refreshPending();
      await load();
    }
  }, [token, userId, load, refreshPending, showToast]);

  useEffect(() => {
    const onOnline = () => {
      void syncPendingQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncPendingQueue]);

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
  }, [token, expenses.length, pendingOps.length]);

  useEffect(() => {
    if (!token) {
      setSavingsGoals([]);
      return;
    }
    let cancelled = false;
    listSavingsGoals(token)
      .then((d) => {
        if (!cancelled) setSavingsGoals(d.goals);
      })
      .catch(() => {
        if (!cancelled) setSavingsGoals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, expenses.length]);

  useEffect(() => {
    if (!token) {
      setCategoryRules([]);
      return;
    }
    let cancelled = false;
    listCategoryRules(token)
      .then((d) => {
        if (!cancelled) setCategoryRules(d.rules);
      })
      .catch(() => {
        if (!cancelled) setCategoryRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadPrevMonthCompare = useCallback(async () => {
    if (!token || (dashTab !== "month" && dashTab !== "overview")) return;
    const prevYm = shiftYm(periodYm, -1);
    const { from, to } = boundsForYm(prevYm);
    const p: ExpenseListQuery = { from, to, limit: 500 };
    if (q.trim()) p.q = q.trim();
    if (category.trim()) p.category = category.trim();
    if (listFilter === "__personal__") p.personal_only = true;
    else if (listFilter) p.shared_list_id = listFilter;
    if (incomeFilter === "in") p.is_income = true;
    if (incomeFilter === "out") p.is_income = false;
    setCompareLoading(true);
    try {
      const { expenses: rows } = await listExpenses(token, p);
      setPrevMonthSummary({
        label: labelForYm(prevYm),
        map: totalsByCurrency(rows),
        count: rows.length,
      });
    } catch {
      setPrevMonthSummary(null);
    } finally {
      setCompareLoading(false);
    }
  }, [token, dashTab, periodYm, q, category, listFilter, incomeFilter]);

  useEffect(() => {
    if (!compareOpen || !token) {
      setPrevMonthSummary(null);
      return;
    }
    void loadPrevMonthCompare();
  }, [compareOpen, token, loadPrevMonthCompare]);

  const displayExpenses = useMemo(() => buildDisplayExpenses(expenses, pendingOps), [expenses, pendingOps]);

  const ruleBadgeByExpenseId = useMemo(() => {
    const rules = categoryRules.map((r) => ({ pattern: r.pattern, category: r.category }));
    const m = new Map<string, string>();
    for (const row of displayExpenses) {
      if (!row.category || row.pending_sync) continue;
      const hit = findMatchingCategoryRule(rules, row.description);
      if (hit && hit.category === row.category) m.set(row.id, hit.pattern);
    }
    return m;
  }, [displayExpenses, categoryRules]);

  const periodLabel = useMemo(() => labelForYm(periodYm), [periodYm]);
  const summaryMap = useMemo(() => totalsByCurrency(displayExpenses), [displayExpenses]);
  const dues = useMemo(() => upcomingDues(displayExpenses, 45), [displayExpenses]);

  const goalsNeedAttention = useMemo(
    () =>
      savingsGoals.filter((g) => {
        const i = savingsGoalInsight(g);
        return i === "Ritmo por debajo del plazo" || i === "Meta vencida sin completar";
      }).length,
    [savingsGoals],
  );

  const smartHints = useMemo(() => {
    const hints: string[] = [];
    if (displayExpenses.length > 2 && categoryRules.length === 0) {
      hints.push("Ahorrá tiempo: en Ajustes, una palabra en la nota puede fijar la categoría sola.");
    }
    if (listFilter && hints.length === 0) {
      hints.push("Los topes miran la categoría del período: cuenta igual el gasto en lista o personal.");
    }
    return hints;
  }, [displayExpenses.length, categoryRules.length, listFilter]);

  const nearBudgetLimit = budgetAlerts.usage.filter((u) => !u.over_limit && u.percent_used >= 85).length;

  const showHealthStrip =
    budgetAlerts.over > 0 || nearBudgetLimit > 0 || dues.length > 0 || goalsNeedAttention > 0;

  const showList = dashTab === "month" || dashTab === "custom";
  const listSlice = dashTab === "overview" ? displayExpenses.slice(0, 8) : displayExpenses;

  async function handleDelete(id: string) {
    const createQ = pendingOps.find((p) => p.op === "create" && p.localId === id);
    if (createQ) {
      if (!confirm("¿Quitar este movimiento de la cola? No se subirá al servidor.")) return;
      await removePending(createQ.localId);
      await refreshPending();
      showToast("Quitado de la cola");
      return;
    }
    if (!token || !confirm("¿Eliminar este movimiento?")) return;
    try {
      await deleteExpense(token, id);
      await load();
      showToast("Movimiento eliminado");
    } catch (e) {
      if (e instanceof NetworkFailure && userId) {
        await enqueueQueued({
          op: "delete",
          localId: crypto.randomUUID(),
          userId,
          expenseId: id,
          queuedAt: new Date().toISOString(),
        });
        await refreshPending();
        showToast("Sin conexión: la baja quedó en cola.");
        return;
      }
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

  function handleExportSummaryTxt() {
    const lines: string[] = [
      "MACAHUMISA — Resumen de período",
      `Generado: ${new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`,
      "",
    ];
    if (dashTab === "month" || dashTab === "overview") {
      lines.push(`Período: ${periodLabel}`);
    } else {
      lines.push(`Vista: personalizado (${from || "—"} → ${to || "—"})`);
    }
    if (filtersActive) lines.push("(Hay filtros activos en la vista.)");
    lines.push("");
    for (const [currency, { spent, income }] of summaryMap.entries()) {
      lines.push(`${currency}: gastado ${fmtMoney(String(spent), currency)}, ingresos ${fmtMoney(String(income), currency)}, balance ${fmtMoney(String(income - spent), currency)}`);
    }
    lines.push(`Movimientos listados: ${displayExpenses.length}`);
    if (budgetAlerts.over > 0) lines.push(`Presupuestos sobre tope: ${budgetAlerts.over}`);
    const warn = budgetAlerts.usage.filter((u) => !u.over_limit && u.percent_used >= 85);
    if (warn.length > 0) lines.push(`Cerca del tope: ${warn.map((u) => `${u.category} ${Math.round(u.percent_used)}%`).join(", ")}`);
    if (dues.length > 0) {
      lines.push("");
      lines.push("Próximos vencimientos (45 días):");
      for (const e of dues) {
        lines.push(`  - ${fmtDateShort(e.due_date!)} ${fmtMoney(e.amount, e.currency)}${e.description ? ` · ${e.description}` : ""}`);
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("Podés adjuntar este archivo a un mail o guardarlo con tu respaldo JSON en Ajustes.");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macahumisa-resumen-${dashTab === "custom" ? "personalizado" : periodYm}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Resumen .txt descargado");
  }

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) {
      showToast("Permití ventanas emergentes para imprimir");
      return;
    }
    const rows = displayExpenses
      .map((row) => {
        const listName = row.shared_list_id ? lists.find((l) => l.id === row.shared_list_id)?.name ?? "—" : "—";
        return `<tr><td>${fmtDate(row.date)}</td><td>${row.is_income ? "+" : "−"} ${fmtMoney(row.amount, row.currency)}</td><td>${row.category ?? "—"}</td><td>${(row.description ?? "—").replace(/</g, "&lt;")}</td><td>${listName}</td></tr>`;
      })
      .join("");
    w.document.write(`<!DOCTYPE html><html><head><title>MACAHUMISA — Movimientos</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:8px;text-align:left} th{background:#eee}</style>
      </head><body><h1>MACAHUMISA — movimientos</h1><table><thead><tr><th>Fecha</th><th>Importe</th><th>Categoría</th><th>Nota</th><th>Lista</th></tr></thead><tbody>${rows}</tbody></table>
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
            Cifras con filtros aplicados.
          </p>
        )}
        {[...summaryMap.entries()].map(([currency, { spent, income }]) => {
          const balance = income - spent;
          const suffix = summaryMap.size > 1 ? ` (${currency})` : "";
          const footnote = filtersActive ? "Con filtros" : "Este período";
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
                balance >= 0 ? "Entrada cubre salida" : "Salida mayor a entrada",
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
          <td style={{ whiteSpace: "nowrap" }}>
            {fmtDate(row.date)}
            {row.pending_sync ? (
              <span className="dash-pending-badge" title="Pendiente de subir">
                cola
              </span>
            ) : null}
          </td>
          <td className={`num ${row.is_income ? "income" : ""}`}>
            {row.is_income ? "+" : "−"} {fmtMoney(row.amount, row.currency)}
          </td>
          <td style={{ color: "var(--text-muted)" }}>
            <span>{row.category ?? "—"}</span>
            {ruleBadgeByExpenseId.has(row.id) ? (
              <span className="dash-rule-badge" title={`Regla automática: «${ruleBadgeByExpenseId.get(row.id)}»`}>
                regla
              </span>
            ) : null}
          </td>
          <td style={{ color: "var(--text-muted)", maxWidth: 200 }}>{row.description ?? "—"}</td>
          <td style={{ color: "var(--text-muted)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
            {row.due_date ? fmtDateShort(row.due_date) : "—"}
          </td>
          <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{listName}</td>
          <td style={{ fontSize: "0.85rem" }}>
            {row.receipt_url ? (
              <a href={row.receipt_url} target="_blank" rel="noreferrer" className="dash-receipt-link">
                Ver foto
              </a>
            ) : (
              "—"
            )}
          </td>
          <td>
            {row.pending_sync ? (
              <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
                Quitar de cola
              </button>
            ) : (
              <>
                <button type="button" className="dash-link-btn" onClick={() => setEditing(row)}>
                  Editar
                </button>{" "}
                {onOpenHistoryForExpense ? (
                  <button
                    type="button"
                    className="dash-link-btn dash-link-btn--muted"
                    onClick={() => onOpenHistoryForExpense(row.id)}
                  >
                    Historial
                  </button>
                ) : null}
                {onOpenHistoryForExpense ? " " : null}
                <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
                  Eliminar
                </button>
              </>
            )}
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
            <span className="dash-exp-card-date">
              {fmtDateShort(row.date)}
              {row.pending_sync ? <span className="dash-pending-badge"> cola</span> : null}
            </span>
            <span className={`dash-exp-card-amount ${row.is_income ? "income" : ""}`}>
              {row.is_income ? "+" : "−"} {fmtMoney(row.amount, row.currency)}
            </span>
          </div>
          <p className="dash-exp-card-meta">
            {(row.category ?? "Sin categoría") + (row.description ? ` · ${row.description}` : "")}
            {ruleBadgeByExpenseId.has(row.id) ? (
              <span className="dash-rule-badge dash-rule-badge--inline" title={`Regla: «${ruleBadgeByExpenseId.get(row.id)}»`}>
                {" "}
                · regla
              </span>
            ) : null}
          </p>
          <p className="dash-exp-card-meta">
            {listName}
            {row.due_date ? ` · Vence ${fmtDateShort(row.due_date)}` : ""}
            {row.receipt_url ? (
              <>
                {" · "}
                <a href={row.receipt_url} target="_blank" rel="noreferrer" className="dash-receipt-link">
                  Comprobante
                </a>
              </>
            ) : null}
          </p>
          <div className="dash-exp-card-actions">
            {row.pending_sync ? (
              <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
                Quitar de cola
              </button>
            ) : (
              <>
                <button type="button" className="dash-link-btn" onClick={() => setEditing(row)}>
                  Editar
                </button>
                {onOpenHistoryForExpense ? (
                  <button
                    type="button"
                    className="dash-link-btn dash-link-btn--muted"
                    onClick={() => onOpenHistoryForExpense(row.id)}
                  >
                    Historial
                  </button>
                ) : null}
                <button type="button" className="dash-link-btn dash-link-btn--muted" onClick={() => handleDelete(row.id)}>
                  Eliminar
                </button>
              </>
            )}
          </div>
        </article>
      );
    });
  }

  return (
    <main className="dash-shell">
      <DatabaseSetupHint message={err} />
      {(dataFromCache || pendingOps.length > 0) && (
        <div className="dash-offline-banner" role="status">
          {dataFromCache ? (
            <p>
              <strong>Sin conexión.</strong> Mostrando la última copia de esta vista en el dispositivo.
            </p>
          ) : null}
          {pendingOps.length > 0 ? (
            <p>
              <strong>{pendingOps.length} pendiente(s)</strong> de subir cuando vuelva la red.
              <button type="button" className="dash-offline-banner__btn" onClick={() => void syncPendingQueue()}>
                Sincronizar
              </button>
            </p>
          ) : null}
        </div>
      )}
      {err && !isDatabaseSetupMessage(err) && <div className="dash-alert dash-alert--error">{err}</div>}

      {showDashboardWelcome && (
        <section className="dash-welcome dash-welcome--polish" aria-labelledby="dash-welcome-title">
          <div className="dash-welcome-top">
            <div>
              <p className="dash-welcome-eyebrow">Primeros pasos</p>
              <h2 id="dash-welcome-title" className="dash-welcome-title">
                Registrá, mirá el mes y ajustá topes si hace falta
              </h2>
            </div>
            <div className="dash-welcome-actions">
              {onOpenTour && (
                <button type="button" className="dash-btn dash-btn--primary" onClick={() => onOpenTour()}>
                  Tour guiado
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
                Cerrar
              </button>
            </div>
          </div>
          <ul className="dash-welcome-list">
            <li>
              <strong>1.</strong> Tocá «+ Nuevo gasto». Elegí mes con las flechas o abrí filtros en las pestañas.
            </li>
            <li>
              <strong>2.</strong> Presupuestos y Metas: en la barra de arriba.
            </li>
            <li>
              <strong>3.</strong> En el celular la lista pasa a tarjetas; si aparece «Salud del mes», es un resumen rápido de alertas.
            </li>
          </ul>
        </section>
      )}

      {showHealthStrip && (
        <section className="dash-health-strip" aria-label="Resumen de alertas">
          <p className="dash-health-strip-label">Qué mirar ahora</p>
          <div className="dash-health-grid">
            {(budgetAlerts.over > 0 || nearBudgetLimit > 0) && (
              <div className="dash-health-card dash-health-card--coral">
                <strong>Presupuestos</strong>
                <p className="dash-health-card-line">
                  {budgetAlerts.over > 0 ? `${budgetAlerts.over} categoría(s) pasadas de tope` : "Nada pasado de tope"}
                </p>
                {nearBudgetLimit > 0 ? (
                  <p className="dash-health-card-sub">{nearBudgetLimit} al 85% o más — revisá en Presupuestos</p>
                ) : null}
              </div>
            )}
            {dues.length > 0 && (
              <div className="dash-health-card dash-health-card--blue">
                <strong>Vencimientos</strong>
                <p className="dash-health-card-line">{dues.length} pago(s) en los próximos 45 días</p>
                <p className="dash-health-card-sub">Desplegá «Próximos pagos» más abajo</p>
              </div>
            )}
            {goalsNeedAttention > 0 && (
              <div className="dash-health-card dash-health-card--mint">
                <strong>Metas</strong>
                <p className="dash-health-card-line">
                  {goalsNeedAttention} meta(s) necesitan atención
                </p>
                <p className="dash-health-card-sub">Abrí Metas en la barra</p>
              </div>
            )}
          </div>
        </section>
      )}

      {onOpenDayHub &&
        dayHubPeek &&
        (dayHubPeek.remindersSoon > 0 || dayHubPeek.shoppingOpen > 0) && (
          <section className="dash-daypeek" aria-label="Resumen día a día">
            <button type="button" className="dash-daypeek__btn" onClick={onOpenDayHub}>
              <span className="dash-daypeek__label">Día a día</span>
              <span className="dash-daypeek__meta">
                {[
                  dayHubPeek.remindersSoon > 0
                    ? `${dayHubPeek.remindersSoon} recordatorio(s) (vencidos o próx. 7 días)`
                    : null,
                  dayHubPeek.shoppingOpen > 0 ? `${dayHubPeek.shoppingOpen} ítem(s) de compra sin tachar` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </section>
        )}

      {smartHints.length > 0 && (
        <section className="dash-smart-strip" aria-label="Sugerencias">
          <p className="dash-smart-strip-label">Un dato útil</p>
          <ul className="dash-smart-strip-list">
            {smartHints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash-hero dash-hero--polish">
        <div className="dash-title-block">
          <h1>Inicio</h1>
          <p className="dash-title-block-lead">
            Sumá cada movimiento acá. Los topes por categoría usan el mismo período y categoría — también si el gasto viene de una lista compartida.
          </p>
          <div className="dash-quick-actions">
            {onNavigate && (
              <>
                <button
                  type="button"
                  className={"dash-btn" + (budgetAlerts.over > 0 ? " dash-btn--warn" : "")}
                  onClick={() => onNavigate("budgets")}
                >
                  Presupuestos{budgetAlerts.over > 0 ? ` · ${budgetAlerts.over} fuera de tope` : ""}
                </button>
                <button type="button" className="dash-btn" onClick={() => onNavigate("goals")}>
                  Metas
                </button>
              </>
            )}
          </div>
        </div>
        <ExpenseForm
          token={token}
          lists={lists}
          userId={userId}
          onCreated={load}
          onPendingChange={refreshPending}
        />
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Vista de gastos">
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "month"}
          className="dash-tab"
          title="Un mes calendario"
          onClick={() => setDashTab("month")}
        >
          Mes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "custom"}
          className="dash-tab"
          title="Rango y filtros avanzados"
          onClick={() => setDashTab("custom")}
        >
          A medida
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "overview"}
          className="dash-tab"
          title="Vista corta del mes"
          onClick={() => setDashTab("overview")}
        >
          Resumen
        </button>
      </div>

      {(dashTab === "month" || dashTab === "overview") && (
        <>
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
          <div className="dash-compare-row">
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              onClick={() => setCompareOpen((v) => !v)}
            >
              {compareOpen ? "Cerrar comparación" : "Comparar con el mes pasado"}
            </button>
          </div>
          {compareOpen && (
            <section className="dash-panel dash-compare-panel" aria-label="Comparación con mes anterior">
              {compareLoading ? (
                <p className="app-loading-text" style={{ margin: 0 }}>Cargando…</p>
              ) : prevMonthSummary ? (
                <>
                  <h2 className="dash-panel-title">Mes anterior · {prevMonthSummary.label}</h2>
                  <p className="dash-compare-lead">
                    Mismos filtros que arriba; solo cambia el mes. Así ves si gastaste más o menos.
                  </p>
                  <div className="dash-compare-grid">
                    <div>
                      <p className="dash-compare-col-title">{periodLabel}</p>
                      <ul className="dash-compare-list">
                        {[...summaryMap.entries()].map(([cur, { spent, income }]) => (
                          <li key={`cur-${cur}`}>
                            <strong>{cur}</strong>: gastado {fmtMoney(String(spent), cur)}, ingresos {fmtMoney(String(income), cur)}, balance{" "}
                            {fmtMoney(String(income - spent), cur)}
                          </li>
                        ))}
                        {summaryMap.size === 0 ? <li>Sin movimientos</li> : null}
                      </ul>
                      <p className="dash-compare-count">{displayExpenses.length} movimiento(s)</p>
                    </div>
                    <div>
                      <p className="dash-compare-col-title">{prevMonthSummary.label}</p>
                      <ul className="dash-compare-list">
                        {[...prevMonthSummary.map.entries()].map(([cur, { spent, income }]) => (
                          <li key={`prev-${cur}`}>
                            <strong>{cur}</strong>: gastado {fmtMoney(String(spent), cur)}, ingresos {fmtMoney(String(income), cur)}, balance{" "}
                            {fmtMoney(String(income - spent), cur)}
                          </li>
                        ))}
                        {prevMonthSummary.map.size === 0 ? <li>Sin movimientos</li> : null}
                      </ul>
                      <p className="dash-compare-count">{prevMonthSummary.count} movimiento(s)</p>
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: "var(--text-muted)" }}>No se pudo cargar el mes pasado. Reintentá.</p>
              )}
            </section>
          )}
        </>
      )}

      {dashTab === "custom" && (
        <section className="dash-panel">
          <h2 className="dash-panel-title">Filtros</h2>
          <p className="dash-panel-lead">
            Fechas opcionales; podés buscar por texto, categoría, lista o tipo. Sin fechas: últimos movimientos.
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
            <p className="dash-filter-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
              Filtrar por lista solo acota la tabla. Los presupuestos siguen mirando categoría + período en todos tus movimientos.
            </p>
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
            <button type="button" className="dash-btn" onClick={() => handleExportSummaryTxt()}>
              Resumen .txt
            </button>
            <button type="button" className="dash-btn" onClick={handlePrint}>
              Imprimir / PDF
            </button>
          </div>
        </section>
      )}

      {(dashTab === "month" || dashTab === "overview") && (
        <section className="dash-panel" style={{ marginBottom: 16 }}>
          <h2 className="dash-panel-title">Filtros · {periodLabel}</h2>
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
            <p className="dash-filter-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
              Los topes miran categoría del mes; cuentan gastos en listas si la categoría coincide.
            </p>
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
            <button type="button" className="dash-btn" onClick={() => handleExportSummaryTxt()}>
              Resumen .txt
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
            <p className="dash-overview-intro">
              <strong>{periodLabel}</strong> — números y últimos movimientos
            </p>
          )}

          {dues.length > 0 && (
            <details className="dash-due-details">
              <summary>
                Próximos pagos · {dues.length} en 45 días
              </summary>
              <ul className="dash-due-details-list">
                {dues.map((e) => (
                  <li key={e.id}>
                    {fmtDateShort(e.due_date!)} — {fmtMoney(e.amount, e.currency)}
                    {e.description ? ` · ${e.description}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {renderKpiSection()}

          {showList && listSlice.length === 0 && (
            <div className="dash-empty">
              <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, fontFamily: "var(--font-display)" }}>No hay movimientos en esta vista</p>
              <p style={{ margin: "12px 0 0", fontSize: "0.9rem", maxWidth: "22rem", marginLeft: "auto", marginRight: "auto" }}>
                Cambiá el mes o tocá <strong style={{ color: "var(--cta)" }}>+ Nuevo gasto</strong> para el primero.
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
                      <th>Compr.</th>
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
            <p className="dash-overview-foot">
              Vista corta: últimos {listSlice.length} del mes. La lista completa está en la pestaña «Mes».
            </p>
          )}

          {dashTab === "overview" && listSlice.length === 0 && !loading && (
            <div className="dash-empty">
              <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)" }}>Nada en {periodLabel}</p>
              <p style={{ margin: "10px 0 0", fontSize: "0.88rem" }}>Probá la pestaña «Mes» o otro mes.</p>
            </div>
          )}
        </>
      )}

      {editing && (
        <ExpenseEditModal
          token={token}
          expense={editing}
          lists={lists}
          userId={userId}
          onClose={() => setEditing(null)}
          onSaved={load}
          onPendingChange={refreshPending}
        />
      )}
    </main>
  );
}
