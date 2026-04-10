import { isDatabaseSetupMessage } from "../lib/isDatabaseSetupMessage";

type Props = {
  message: string | null | undefined;
};

export function DatabaseSetupHint({ message }: Props) {
  if (!message || !isDatabaseSetupMessage(message)) return null;
  return (
    <div className="dash-alert dash-alert--setup" role="status" style={{ marginBottom: 16 }}>
      <strong>Tenés que sincronizar la base de datos con el código.</strong>
      <ol style={{ margin: "12px 0 0", paddingLeft: "1.25rem", lineHeight: 1.6 }}>
        <li>
          Terminal en la raíz del proyecto (donde está <code>package.json</code>), no dentro de <code>web/</code>.
        </li>
        <li>
          Archivo <code>.env</code> con <code>DATABASE_URL=postgresql://...</code>.
        </li>
        <li>
          Ejecutá: <code>npm run db:migrate</code>
        </li>
        <li>
          Reiniciá la API (<code>npm run dev</code> en la raíz) y recargá esta página.
        </li>
      </ol>
      <p style={{ margin: "12px 0 0", fontSize: "0.85rem", opacity: 0.95 }}>
        Si ves algo como «column … does not exist», es casi seguro que falta correr la migración: agrega tablas y columnas nuevas
        (por ejemplo <code>due_date</code> en gastos).
      </p>
    </div>
  );
}
