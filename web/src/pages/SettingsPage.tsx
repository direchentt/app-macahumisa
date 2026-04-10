import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { DatabaseSetupHint } from "../components/DatabaseSetupHint";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";
import {
  createCategoryRule,
  deleteCategoryRule,
  getWebhook,
  fetchBackupJson,
  listCategoryRules,
  putWebhook,
  deleteWebhook,
  type CategoryRule,
} from "../api/client";

const field = {
  width: "100%",
  maxWidth: 480,
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
} as const;

export function SettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const [r, w] = await Promise.all([listCategoryRules(token), getWebhook(token)]);
      setRules(r.rules);
      setWebhookUrl(w.webhook?.url ?? "");
      setWebhookSaved(w.webhook?.url ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !pattern.trim() || !category.trim()) return;
    setErr(null);
    try {
      await createCategoryRule(token, { pattern: pattern.trim(), category: category.trim() });
      setPattern("");
      setCategory("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function downloadBackup() {
    if (!token) return;
    setBackupBusy(true);
    try {
      const data = await fetchBackupJson(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `macahumisa-respaldo-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Respaldo JSON descargado");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al generar respaldo");
    } finally {
      setBackupBusy(false);
    }
  }

  async function removeRule(id: string) {
    if (!token) return;
    try {
      await deleteCategoryRule(token, id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setErr(null);
    try {
      if (!webhookUrl.trim()) {
        await deleteWebhook(token);
        setWebhookSaved(null);
      } else {
        const d = await putWebhook(token, webhookUrl.trim());
        setWebhookSaved(d.webhook.url);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  if (!token) return null;

  return (
    <main style={{ flex: 1, padding: "24px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Ajustes</h1>
      <p style={{ margin: "0 0 24px", color: "var(--text-muted)" }}>
        Reglas de categoría: si la nota o descripción contiene el texto (sin distinguir mayúsculas), se asigna la categoría al
        crear un gasto (si dejaste categoría vacía). Webhook: recibís un POST JSON con{" "}
        <code style={{ fontSize: "0.85em" }}>event: &quot;expense.created&quot;</code> cada vez que cargás un gasto.
      </p>
      <DatabaseSetupHint message={err} />
      {err && !isDatabaseSetupMessage(err) && (
        <p style={{ padding: 12, borderRadius: "var(--radius-sm)", background: "rgba(242,139,130,0.12)", color: "var(--danger)" }}>
          {err}
        </p>
      )}

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Respaldo de tus datos</h2>
        <p style={{ margin: "0 0 12px", color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
          Descargá un archivo JSON con gastos visibles para tu cuenta, presupuestos, metas, listas, reglas, membresías y webhook.
          Guardalo en un lugar seguro (y repetí cuando quieras). La app también guarda en este dispositivo la última vista de
          movimientos para consulta sin red.
        </p>
        <button
          type="button"
          disabled={backupBusy || !token}
          onClick={() => void downloadBackup()}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--cta)",
            color: "var(--cta-fg)",
            fontWeight: 700,
            opacity: backupBusy ? 0.65 : 1,
            cursor: backupBusy ? "wait" : "pointer",
          }}
        >
          {backupBusy ? "Generando…" : "Descargar respaldo JSON"}
        </button>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Reglas automáticas de categoría</h2>
        <form onSubmit={addRule} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
          <label style={{ flex: "1 1 160px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Texto en nota/descripción</span>
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="uber, super, alquiler…" style={{ ...field, marginTop: 4, maxWidth: "none" }} />
          </label>
          <label style={{ flex: "1 1 120px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Categoría</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="transporte" style={{ ...field, marginTop: 4, maxWidth: "none" }} />
          </label>
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--cta)",
              color: "var(--cta-fg)",
              fontWeight: 700,
            }}
          >
            Agregar regla
          </button>
        </form>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        ) : rules.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay reglas.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <span>
                  <strong>«{r.pattern}»</strong> → {r.category}
                </span>
                <button type="button" onClick={() => removeRule(r.id)} style={{ border: "none", background: "transparent", color: "var(--danger)", textDecoration: "underline" }}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Webhook (un URL por cuenta)</h2>
        <form onSubmit={saveWebhook} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://tu-servidor.com/macahumisa"
            style={field}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: "var(--cta)",
                color: "var(--cta-fg)",
                fontWeight: 700,
              }}
            >
              Guardar webhook
            </button>
            {webhookSaved && (
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", alignSelf: "center" }}>Configurado ✓</span>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
