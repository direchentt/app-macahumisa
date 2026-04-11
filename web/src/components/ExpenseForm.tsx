import { useState, useEffect, useRef } from "react";
import type { SharedList } from "../api/client";
import { ApiError, createExpense, listCategoryRules, NetworkFailure } from "../api/client";
import { enqueueQueued } from "../lib/offlineDb";
import { useToast } from "../contexts/ToastContext";
import { compressReceiptToDataUrl } from "../lib/compressReceiptImage";
import { findMatchingCategoryRule } from "../lib/categoryRuleMatch";

type Props = {
  token: string;
  lists: SharedList[];
  userId: string | null;
  onCreated: () => void;
  onPendingChange?: () => void;
};

export function ExpenseForm({ token, lists, userId, onCreated, onPendingChange }: Props) {
  const { showToast } = useToast();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isIncome, setIsIncome] = useState(false);
  const [sharedListId, setSharedListId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [dueDate, setDueDate] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptLabel, setReceiptLabel] = useState<string | null>(null);
  const [categoryRules, setCategoryRules] = useState<{ pattern: string; category: string }[]>([]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

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

  function resetAfterSave(recordedAsIncome: boolean, opts?: { noToast?: boolean; toastDetail?: string }) {
    setAmount("");
    setCategory("");
    setDescription("");
    setSharedListId("");
    setIsIncome(false);
    setDueDate("");
    setReceiptPreview(null);
    setReceiptLabel(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
    setOpen(false);
    onCreated();
    if (!opts?.noToast) {
      const base = recordedAsIncome ? "Ingreso registrado" : "Gasto guardado";
      showToast(opts?.toastDetail ? `${base} · ${opts.toastDetail}` : base);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount.replace(",", "."));
    if (Number.isNaN(n) || n <= 0) {
      setError("Ingresá un importe válido");
      return;
    }
    setLoading(true);
    const recordedAsIncome = isIncome;
    const payload = {
      amount: n,
      currency: currency.toUpperCase(),
      date: new Date(when).toISOString(),
      category: category.trim() || null,
      description: description.trim() || null,
      is_income: isIncome,
      shared_list_id: sharedListId || null,
      due_date: dueDate.trim() ? new Date(dueDate).toISOString() : null,
      receipt_url: receiptPreview,
    };
    try {
      let savedExpense: { category: string | null; description: string | null } | null = null;
      try {
        const { expense } = await createExpense(token, { ...payload, force_duplicate: false });
        savedExpense = expense;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const ok = window.confirm(
            "Ya cargaste un movimiento con el mismo importe y moneda en este día. ¿Querés guardar este igualmente?",
          );
          if (!ok) return;
          const { expense } = await createExpense(token, { ...payload, force_duplicate: true });
          savedExpense = expense;
        } else {
          throw err;
        }
      }
      let ruleDetail: string | undefined;
      if (savedExpense && !category.trim() && savedExpense.category) {
        const matched = findMatchingCategoryRule(categoryRules, savedExpense.description);
        if (matched && matched.category === savedExpense.category) {
          ruleDetail = `categoría «${matched.category}» por regla «${matched.pattern}»`;
        }
      }
      resetAfterSave(recordedAsIncome, ruleDetail ? { toastDetail: ruleDetail } : undefined);
    } catch (err) {
      if (err instanceof NetworkFailure && userId) {
        await enqueueQueued({
          op: "create",
          localId: crypto.randomUUID(),
          userId,
          body: {
            amount: n,
            currency: currency.toUpperCase(),
            date: new Date(when).toISOString(),
            category: category.trim() || null,
            description: description.trim() || null,
            is_income: recordedAsIncome,
            shared_list_id: sharedListId || null,
            due_date: dueDate.trim() ? new Date(dueDate).toISOString() : null,
            receipt_url: receiptPreview,
          },
          queuedAt: new Date().toISOString(),
        });
        showToast("Sin conexión: el movimiento quedó en cola y se subirá cuando vuelva la red.");
        resetAfterSave(recordedAsIncome, { noToast: true });
        onPendingChange?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptPreview(null);
      setReceiptLabel(null);
      return;
    }
    setError(null);
    try {
      const dataUrl = await compressReceiptToDataUrl(file);
      setReceiptPreview(dataUrl);
      setReceiptLabel(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la imagen");
      e.target.value = "";
      setReceiptPreview(null);
      setReceiptLabel(null);
    }
  }

  function clearReceipt() {
    setReceiptPreview(null);
    setReceiptLabel(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="expense-trigger">
        + Nuevo gasto
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="expense-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 className="expense-panel-title">Nuevo movimiento</h2>
        <button type="button" onClick={() => setOpen(false)} className="expense-panel-close" aria-label="Cerrar">
          ×
        </button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <label>
          <span className="expense-field-label">Importe</span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="expense-input"
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <label>
            <span className="expense-field-label">Moneda</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.slice(0, 3).toUpperCase())}
              maxLength={3}
              className="expense-input"
            />
          </label>
          <label>
            <span className="expense-field-label">Fecha y hora</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="expense-input" />
          </label>
        </div>
        <label>
          <span className="expense-field-label">Vencimiento (opcional, recordatorio)</span>
          <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="expense-input" />
        </label>
        <label>
          <span className="expense-field-label">Categoría</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ej. comida, transporte"
            className="expense-input"
          />
        </label>
        <label>
          <span className="expense-field-label">Nota</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
            className="expense-input"
          />
        </label>
        <div className="expense-receipt">
          <span className="expense-field-label">Comprobante (opcional)</span>
          <div className="expense-receipt-row">
            <input ref={receiptInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onReceiptChange} className="expense-receipt-input" />
            {receiptPreview && (
              <button type="button" className="expense-receipt-clear" onClick={clearReceipt}>
                Quitar
              </button>
            )}
          </div>
          {receiptLabel && <p className="expense-receipt-name">{receiptLabel}</p>}
          {receiptPreview && <img src={receiptPreview} alt="" className="expense-receipt-thumb" />}
        </div>
        {lists.length > 0 && (
          <label>
            <span className="expense-field-label">Lista compartida (opcional)</span>
            <select value={sharedListId} onChange={(e) => setSharedListId(e.target.value)} className="expense-input">
              <option value="">Solo para mí</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={isIncome} onChange={(e) => setIsIncome(e.target.checked)} />
          <span>Es ingreso</span>
        </label>
      </div>

      {error && (
        <p style={{ margin: "14px 0 0", color: "var(--danger)", fontSize: "0.9rem" }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button type="submit" disabled={loading} className="expense-submit">
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
