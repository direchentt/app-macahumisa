import { useState, useEffect } from "react";
import type { SharedList } from "../api/client";
import { createExpense } from "../api/client";

type Props = {
  token: string;
  lists: SharedList[];
  onCreated: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
} as const;

export function ExpenseForm({ token, lists, onCreated }: Props) {
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
      await createExpense(token, {
        amount: n,
        currency: currency.toUpperCase(),
        date: new Date(when).toISOString(),
        category: category.trim() || null,
        description: description.trim() || null,
        is_income: isIncome,
        shared_list_id: sharedListId || null,
      });
      setAmount("");
      setCategory("");
      setDescription("");
      setSharedListId("");
      setIsIncome(false);
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "14px 22px",
          border: "none",
          borderRadius: "var(--radius-sm)",
          background: "var(--accent)",
          color: "#0a0f0d",
          fontWeight: 700,
          fontSize: "1rem",
        }}
      >
        + Nuevo gasto
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{
        padding: 24,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        maxWidth: 480,
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Registrar movimiento</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "1.25rem",
            lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <label>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Importe</span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Moneda</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.slice(0, 3).toUpperCase())}
              maxLength={3}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Fecha y hora</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
        </div>
        <label>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Categoría</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ej. comida, transporte"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </label>
        <label>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Nota</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </label>
        {lists.length > 0 && (
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Lista compartida (opcional)</span>
            <select
              value={sharedListId}
              onChange={(e) => setSharedListId(e.target.value)}
              style={{ ...inputStyle, marginTop: 6 }}
            >
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
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px 18px",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            color: "#0a0f0d",
            fontWeight: 700,
          }}
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
