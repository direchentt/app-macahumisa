import { useCallback, useState } from "react";
import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";

type Props = {
  message: string | null | undefined;
};

const MIGRATE_CMD = "npm run db:migrate";

export function DatabaseSetupHint({ message }: Props) {
  const [copied, setCopied] = useState(false);

  const copyCmd = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(MIGRATE_CMD);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* sin permisos de portapapeles */
      }
    })();
  }, []);

  if (!message || !isDatabaseSetupMessage(message)) return null;

  return (
    <div className="dash-alert dash-alert--setup db-setup-hint" role="status">
      <p className="db-setup-hint__lead">
        <strong>La base de datos está desactualizada respecto al código.</strong> No es un fallo del navegador: hay que aplicar las
        migraciones SQL en PostgreSQL (crean o alteran tablas y columnas).
      </p>
      <ol className="db-setup-hint__steps">
        <li>
          Abrí una terminal en la <strong>carpeta raíz del repo</strong> (donde está el <code className="db-setup-hint__mono">package.json</code> del
          backend), <strong>no</strong> dentro de <code className="db-setup-hint__mono">web/</code>.
        </li>
        <li>
          En esa misma carpeta, el archivo <code className="db-setup-hint__mono">.env</code> debe incluir{" "}
          <code className="db-setup-hint__mono">DATABASE_URL=postgresql://…</code> apuntando a la misma base que usa tu API (local o
          producción).
        </li>
        <li>
          Ejecutá el comando (podés copiarlo):
          <div className="db-setup-hint__cmd-row">
            <pre className="db-setup-hint__pre" tabIndex={0}>
              <code>{MIGRATE_CMD}</code>
            </pre>
            <button type="button" className="db-setup-hint__copy" onClick={copyCmd}>
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </li>
        <li>
          Reiniciá el proceso de la API (<code className="db-setup-hint__mono">npm run dev</code> o el deploy) y recargá esta página.
        </li>
      </ol>
      <details className="db-setup-hint__cloud">
        <summary>Si la app está hosteada (Railway, Render, Fly, VPS…)</summary>
        <p>
          El comando <code className="db-setup-hint__mono">npm run db:migrate</code> tiene que correrse <strong>donde exista</strong>{" "}
          <code className="db-setup-hint__mono">DATABASE_URL</code>: por ejemplo como <strong>release command</strong> / paso previo al
          start, o desde tu PC con la URI de la base de producción (con cuidado). La carpeta <code className="db-setup-hint__mono">web/</code>{" "}
          no ejecuta migraciones.
        </p>
      </details>
      <p className="db-setup-hint__foot">
        Mensajes como «column … does not exist» o «relation … does not exist» suelen indicar exactamente esto: falta una migración
        reciente (por ejemplo tablas de <em>Día a día</em> o columnas nuevas en gastos).
      </p>
    </div>
  );
}
