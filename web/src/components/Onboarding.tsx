import { useEffect, useRef, useState } from "react";

type Props = {
  /** Marca el tour como visto (Saltar, último paso). */
  onFinish: () => void;
  /** Solo cierra el modal (Escape); el tour puede volver a mostrarse al entrar o con «Tour guiado». */
  onDismiss: () => void;
};

const STEPS: { title: string; body: string; hint?: string }[] = [
  {
    title: "Te damos la bienvenida",
    body: "En un minuto vas a saber cómo moverte por MACAHUMISA. Podés saltar en cualquier momento con el botón de abajo.",
    hint: "Esc cierra el tour sin marcarlo como visto; «Saltar tour» sí lo marca para tu usuario.",
  },
  {
    title: "Gastos",
    body: "Acá registrás lo que gastás o cobrás. Podés elegir una lista compartida para que familia o equipo vea ese movimiento.",
    hint: "Usá «Nuevo gasto» cuando quieras cargar algo.",
  },
  {
    title: "Presupuestos",
    body: "Definí un tope por categoría (mensual, semanal o anual) y mirá cuánto llevás usado del período.",
    hint: "Ideal para no pasarte en comida, transporte, etc.",
  },
  {
    title: "Listas compartidas",
    body: "Creá una lista e invitá por email a quien ya tenga cuenta. Los editores cargan gastos; los visualizadores solo miran.",
    hint: "El dueño invita y puede quitar miembros.",
  },
  {
    title: "Avisos",
    body: "Cuando alguien suma un gasto en una lista donde estás, aparece un aviso arriba. Si configurás SendGrid, también te llega por email.",
    hint: "El número rojo es la cantidad sin leer.",
  },
  {
    title: "¡Listo!",
    body: "El menú superior cambia de sección en un clic. Empezá cargando un gasto o explorá Presupuestos y Listas.",
    hint: "Tenés también Metas, Ajustes (reglas y webhook) y tema claro/oscuro en la barra superior.",
  },
];

export function Onboarding({ onFinish, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastStep = step === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("button[data-onboarding-primary]")?.focus();
  }, [step]);

  return (
    <div
      className="onboarding-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: "var(--radius)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-md)",
          padding: "28px 24px 22px",
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)", textTransform: "uppercase" }}>
          Paso {step + 1} de {STEPS.length}
        </p>
        <h2
          id="onboarding-title"
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--font-display)",
            fontSize: "1.35rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.25,
          }}
        >
          {STEPS[step].title}
        </h2>
        <p style={{ margin: "0 0 14px", color: "var(--text)", fontSize: "1rem", lineHeight: 1.55 }}>{STEPS[step].body}</p>
        {STEPS[step].hint && (
          <p
            style={{
              margin: "0 0 22px",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-dim)",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: "var(--text)" }}>Tip: </strong>
            {STEPS[step].hint}
          </p>
        )}
        {!STEPS[step].hint && <div style={{ height: 8 }} />}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {STEPS.map((_, i) => {
            const colors = ["var(--brand-coral)", "var(--brand-mint)", "var(--brand-blue)"] as const;
            const activeColor = colors[i % 3];
            return (
              <span
                key={i}
                style={{
                  width: i === step ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === step ? activeColor : "var(--border)",
                  transition: "width 0.2s ease, background 0.2s ease",
                }}
                aria-hidden
              />
            );
          })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={onFinish}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              textDecoration: "underline",
            }}
          >
            Saltar tour
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                style={{
                  padding: "12px 18px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              data-onboarding-primary
              onClick={() => {
                if (lastStep) onFinish();
                else setStep((s) => s + 1);
              }}
              style={{
                padding: "12px 22px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--cta)",
                color: "var(--cta-fg)",
                fontWeight: 700,
                boxShadow: "0 4px 16px color-mix(in srgb, var(--brand-blue) 30%, transparent)",
                fontSize: "1rem",
              }}
            >
              {lastStep ? "Empezar a usar la app" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
