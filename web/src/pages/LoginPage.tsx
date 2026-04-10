import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { IconLogo } from "../components/AppIcons";
import { AvatarGlyphPicker } from "../components/AvatarGlyphPicker";
import type { AvatarSlug } from "../lib/avatarOptions";

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarSlug, setAvatarSlug] = useState<AvatarSlug | null>(null);
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
        await register(email, password, firstName || undefined, lastName || undefined, avatarSlug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-ambient" aria-hidden>
        <span className="auth-orb auth-orb--coral" />
        <span className="auth-orb auth-orb--blue" />
        <span className="auth-orb auth-orb--mint" />
      </div>
      <div className="auth-shimmer" aria-hidden />

      <div className="auth-card auth-card--apple">
        <div className="auth-stagger">
          <p className="auth-eyebrow">Gastos y presupuestos</p>
          <h1 className="auth-title auth-title--with-icon auth-brand-uppercase">
            <span className="auth-logo-ring">
              <IconLogo className="auth-title-icon" />
            </span>
            MACAHUMISA
          </h1>
          <p className="auth-subtitle">
            Registrá movimientos, compartí listas y controlá el consumo por categoría sin perder de vista el mes.
          </p>
          <ul className="auth-benefits">
            <li>Tour guiado al entrar para ubicarte en cada sección.</li>
            <li>Listas compartidas por email y avisos cuando hay actividad.</li>
            <li>Presupuestos por categoría, comprobante por foto y avisos de duplicados.</li>
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
              <div className="auth-register-grid">
                <label className="auth-label auth-label--compact">
                  <span>Nombre</span>
                  <input
                    className="auth-input"
                    placeholder="Nombre"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="auth-label auth-label--compact">
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
            {mode === "register" && (
              <AvatarGlyphPicker
                idPrefix="auth-register"
                value={avatarSlug}
                onChange={setAvatarSlug}
                disabled={loading}
              />
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
        </div>

        {import.meta.env.DEV && (
          <p className="auth-footnote">
            Desarrollo: API en <code>localhost:3000</code> (proxy Vite).
          </p>
        )}
      </div>
    </div>
  );
}
