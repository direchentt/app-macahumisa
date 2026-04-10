/** Mensajes del API o de Postgres que indican migración pendiente (.env + npm run db:migrate). */
export function isDatabaseSetupMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("db:migrate") ||
    m.includes("npm run db") ||
    m.includes("migraciones") ||
    m.includes("tablas necesarias") ||
    m.includes("desactualizada") ||
    m.includes("falta actualizar la base") ||
    m.includes("estructura de la base") ||
    m.includes("sincronizar la base") ||
    m.includes("due_date") ||
    m.includes("42703") ||
    m.includes("42p01") ||
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}
