import { useEffect, useRef, useState } from "react";

type Props = {
  onFinish: () => void;
  onDismiss: () => void;
};

const STEPS: { title: string; body: string; hint?: string }[] = [
  {
    title: "Bienvenida",
    body: "En pocos pasos vas a saber qué tocar primero: registrar, compartir y controlar.",
    hint: "Esc: cierra sin marcar el tour como visto. «Saltar tour»: lo oculta para siempre en tu cuenta.",
  },
  {
    title: "Registrar movimientos",
    body: "Cada gasto o ingreso va acá. Si elegís una lista compartida, el resto del grupo lo ve.",
    hint: "Usá el botón «+ Nuevo gasto» (arriba a la derecha en Inicio).",
  },
  {
    title: "Presupuestos",
    body: "Definí un tope por categoría; la app te muestra cuánto llevás del período.",
    hint: "Entrá desde Presupuestos en la barra superior.",
  },
  {
    title: "Listas compartidas",
    body: "Creá una lista e invitá por email. Quien edita carga gastos; quien mira solo ve el detalle.",
    hint: "El dueño invita y puede sacar miembros.",
  },
  {
    title: "Avisos",
    body: "Cuando hay actividad en una lista donde estás, aparece un aviso. Si hay email configurado, también te llega allí.",
    hint: "El número rojo en el ícono = avisos sin leer.",
  },
  {
    title: "Listo para usar",
    body: "Explorá Inicio, Metas y Ajustes cuando quieras. Lo esencial ya lo tenés.",
    hint: "Extra: comparar meses e historial por movimiento en Inicio; reglas y respaldo en Ajustes.",
  },
];

export function Onboarding({ onFinish, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastStep = step === STEPS.length - 1;
  const s = STEPS[step]!;
  const hintText = s.hint;

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
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div ref={panelRef} className="onboarding-dialog">
        <p className="onboarding-kicker">Paso {step + 1} de {STEPS.length}</p>
        <h2 id="onboarding-title" className="onboarding-title">
          {s.title}
        </h2>
        <p className="onboarding-body">{s.body}</p>
        {hintText ? (
          <p className="onboarding-hint">
            <span className="onboarding-hint-label">Tip</span>
            {hintText}
          </p>
        ) : (
          <div className="onboarding-hint-spacer" aria-hidden />
        )}

        <div className="onboarding-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? " onboarding-dot--active" : ""}`} data-dot-index={i % 3} />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-link" onClick={onFinish}>
            Saltar tour
          </button>
          <div className="onboarding-actions-main">
            {step > 0 && (
              <button type="button" className="onboarding-btn onboarding-btn--secondary" onClick={() => setStep((x) => x - 1)}>
                Atrás
              </button>
            )}
            <button
              type="button"
              data-onboarding-primary
              className="onboarding-btn onboarding-btn--primary"
              onClick={() => {
                if (lastStep) onFinish();
                else setStep((x) => x + 1);
              }}
            >
              {lastStep ? "Entrar a la app" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
