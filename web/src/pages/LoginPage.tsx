import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

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
    <div className="auth-screen">
      <div className="auth-card">
        <p className="auth-eyebrow">Gastos y presupuestos</p>
        <h1 className="auth-title">Macahumisa</h1>
        <p className="auth-subtitle">Registrá movimientos, compartí listas y controlá el consumo por categoría sin perder de vista el mes.</p>
        <ul className="auth-benefits">
          <li>Tour guiado al entrar para ubicarte en cada sección.</li>
          <li>Listas compartidas por email y avisos cuando hay actividad.</li>
          <li>Presupuestos por categoría y resumen por período.</li>
        </ul>

        <div className="auth-segmented" role="tablist" aria-label="Modo de acceso">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>
            Iniciar sesión
          </button>
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label className="auth-label" style={{ marginBottom: 0 }}>
                <span>Nombre</span>
                <input
                  className="auth-input"
                  placeholder="Nombre"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </label>
              <label className="auth-label" style={{ marginBottom: 0 }}>
                <span>Apellido</span>
                <input
                  className="auth-input"
                  placeholder="Apellido"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}
          <label className="auth-label">
            <span>Email</span>
            <input
              type="email"
              required
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="auth-label">
            <span>Contraseña {mode === "register" && "(mín. 8 caracteres)"}</span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? "Esperá…" : mode === "login" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <p className="auth-footnote">
          Desarrollo: API en <code>localhost:3000</code> (proxy Vite). Producción Docker: mismo puerto 3000.
        </p>
      </div>
    </div>
  );
}
