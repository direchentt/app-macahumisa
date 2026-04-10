import { useState, useEffect } from "react";
import type { SharedList } from "../api/client";
import { createExpense } from "../api/client";
import { useToast } from "../contexts/ToastContext";

type Props = {
  token: string;
  lists: SharedList[];
  onCreated: () => void;
};

export function ExpenseForm({ token, lists, onCreated }: Props) {
  const { showToast } = useToast();
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

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount.replace(",", "."));
    if (Number.isNaN(n) || n <= 0) {
      setError("Ingresá un importe válido");
      return;
    }
    setLoading(true);
    try {
      const recordedAsIncome = isIncome;
      await createExpense(token, {
        amount: n,
        currency: currency.toUpperCase(),
        date: new Date(when).toISOString(),
        category: category.trim() || null,
        description: description.trim() || null,
        is_income: isIncome,
        shared_list_id: sharedListId || null,
        due_date: dueDate.trim() ? new Date(dueDate).toISOString() : null,
      });
      setAmount("");
      setCategory("");
      setDescription("");
      setSharedListId("");
      setIsIncome(false);
      setDueDate("");
      setOpen(false);
      onCreated();
      showToast(recordedAsIncome ? "Ingreso registrado" : "Gasto guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
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
        <h2 className="expense-panel-title">Registrar movimiento</h2>
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
