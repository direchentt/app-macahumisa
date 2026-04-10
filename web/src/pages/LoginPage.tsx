import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const field = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
} as const;

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, firstName || undefined, lastName || undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(ellipse 120% 80% at 50% -20%, var(--accent-dim), transparent), var(--bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "32px",
          borderRadius: "var(--radius)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", fontWeight: 700 }}>Macahumisa</h1>
        <p style={{ margin: "0 0 28px", color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Gastos, listas compartidas y presupuestos en un solo lugar.
        </p>

        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 24,
            padding: 4,
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: "10px 16px",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              background: mode === "login" ? "var(--bg-elevated)" : "transparent",
              color: "var(--text)",
              boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            style={{
              flex: 1,
              padding: "10px 16px",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              background: mode === "register" ? "var(--bg-elevated)" : "transparent",
              color: "var(--text)",
              boxShadow: mode === "register" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <input
                placeholder="Nombre"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={field}
                autoComplete="given-name"
              />
              <input
                placeholder="Apellido"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={field}
                autoComplete="family-name"
              />
            </div>
          )}
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={field}
              autoComplete="email"
            />
          </label>
          <label style={{ display: "block", marginBottom: 20 }}>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
              Contraseña {mode === "register" && "(mín. 8 caracteres)"}
            </span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={field}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && (
            <p
              role="alert"
              style={{
                margin: "0 0 16px",
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(242, 139, 130, 0.12)",
                color: "var(--danger)",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 20px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent)",
              color: "#0a0f0d",
              fontWeight: 700,
              fontSize: "1rem",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Esperá…" : mode === "login" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <p style={{ margin: "24px 0 0", fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
          El servidor API debe estar en <code style={{ fontSize: "0.8em" }}>localhost:3000</code> (proxy Vite).
        </p>
      </div>
    </div>
  );
}
