import { useState, useRef } from "react";
import type { Expense, SharedList } from "../api/client";
import { NetworkFailure, updateExpense } from "../api/client";
import { enqueueQueued, type PendingUpdateBody } from "../lib/offlineDb";
import { useToast } from "../contexts/ToastContext";
import { compressReceiptToDataUrl } from "../lib/compressReceiptImage";

type Props = {
  token: string;
  expense: Expense;
  lists: SharedList[];
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onPendingChange?: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
} as const;

export function ExpenseEditModal({ token, expense, lists, userId, onClose, onSaved, onPendingChange }: Props) {
  const { showToast } = useToast();
  const receiptRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(expense.amount.replace(".", ","));
  const [currency, setCurrency] = useState(expense.currency);
  const [category, setCategory] = useState(expense.category ?? "");
  const [description, setDescription] = useState(expense.description ?? "");
  const [isIncome, setIsIncome] = useState(expense.is_income);
  const [sharedListId, setSharedListId] = useState(expense.shared_list_id ?? "");
  const [when, setWhen] = useState(() => new Date(expense.date).toISOString().slice(0, 16));
  const [due, setDue] = useState(expense.due_date ? new Date(expense.due_date).toISOString().slice(0, 16) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(expense.receipt_url);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount.replace(",", "."));
    if (Number.isNaN(n) || n <= 0) {
      setError("Importe inválido");
      return;
    }
    setLoading(true);
    try {
      const asIncome = isIncome;
      const patch: PendingUpdateBody = {
        amount: n,
        currency: currency.toUpperCase().slice(0, 3),
        date: new Date(when).toISOString(),
        category: category.trim() || null,
        description: description.trim() || null,
        is_income: isIncome,
        shared_list_id: sharedListId || null,
        due_date: due.trim() ? new Date(due).toISOString() : null,
        receipt_url: receiptUrl,
      };
      await updateExpense(token, expense.id, patch);
      onSaved();
      onClose();
      showToast(asIncome ? "Ingreso actualizado" : "Gasto actualizado");
    } catch (err) {
      if (err instanceof NetworkFailure && userId) {
        const patch: PendingUpdateBody = {
          amount: n,
          currency: currency.toUpperCase().slice(0, 3),
          date: new Date(when).toISOString(),
          category: category.trim() || null,
          description: description.trim() || null,
          is_income: isIncome,
          shared_list_id: sharedListId || null,
          due_date: due.trim() ? new Date(due).toISOString() : null,
          receipt_url: receiptUrl,
        };
        await enqueueQueued({
          op: "update",
          localId: crypto.randomUUID(),
          userId,
          expenseId: expense.id,
          body: patch,
          queuedAt: new Date().toISOString(),
        });
        showToast("Sin conexión: los cambios quedaron en cola.");
        onPendingChange?.();
        onSaved();
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-expense-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 24,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="edit-expense-title" style={{ margin: 0, fontSize: "1.15rem" }}>
            Editar movimiento
          </h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "1.25rem" }} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Importe</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} required style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <label>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Moneda</span>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Fecha</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
          </div>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Vencimiento (opcional)</span>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Categoría</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Nota</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
          </label>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Comprobante</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                ref={receiptRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setError(null);
                  try {
                    setReceiptUrl(await compressReceiptToDataUrl(f));
                    setReceiptFileName(f.name);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Imagen inválida");
                    e.target.value = "";
                  }
                }}
                style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
              />
              {receiptUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setReceiptUrl(null);
                    setReceiptFileName(null);
                    if (receiptRef.current) receiptRef.current.value = "";
                  }}
                  style={{ ...inputStyle, padding: "6px 12px", cursor: "pointer" }}
                >
                  Quitar
                </button>
              )}
            </div>
            {receiptFileName && <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>{receiptFileName}</p>}
            {receiptUrl && receiptUrl.startsWith("data:") && (
              <img src={receiptUrl} alt="" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)" }} />
            )}
            {receiptUrl && receiptUrl.startsWith("http") && (
              <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: "0.85rem" }}>
                Ver comprobante actual
              </a>
            )}
          </div>
          {lists.length > 0 && (
            <label>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Lista</span>
              <select value={sharedListId} onChange={(e) => setSharedListId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                <option value="">Personal</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isIncome} onChange={(e) => setIsIncome(e.target.checked)} />
            Es ingreso
          </label>
        </div>
        {error && (
          <p style={{ margin: "12px 0 0", color: "var(--danger)", fontSize: "0.9rem" }} role="alert">
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--cta)",
              color: "var(--cta-fg)",
              fontWeight: 700,
            }}
          >
            {loading ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
