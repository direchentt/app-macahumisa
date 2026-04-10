/** Mensajes seguros para el cliente ante fallos típicos de PostgreSQL / red. */

function unwrapErr(err: unknown): { code?: string; message?: string } {
  if (err === null || err === undefined) {
    return {};
  }
  const e = err as { code?: string; message?: string; cause?: unknown; errors?: unknown[] };
  if (e.cause !== undefined && e.cause !== null) {
    return unwrapErr(e.cause);
  }
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    return unwrapErr(e.errors[0]);
  }
  return { code: typeof e.code === "string" ? e.code : undefined, message: typeof e.message === "string" ? e.message : undefined };
}

/** Mensajes seguros para el cliente ante fallos típicos de PostgreSQL / red. */
export function mapServerError(err: unknown, isDev: boolean): { error: string; detail?: string } {
  const { code, message } = unwrapErr(err);
  const e = { code, message };
  const msgLower = (e.message ?? "").toLowerCase();

  if (e.code === "42P01") {
    return {
      error:
        "La base de datos no tiene las tablas necesarias. En la carpeta del proyecto ejecutá en una terminal: npm run db:migrate",
    };
  }
  if (msgLower.includes("relation") && msgLower.includes("does not exist")) {
    return {
      error:
        "Falta crear las tablas en PostgreSQL. En la raíz del proyecto ejecutá: npm run db:migrate (con DATABASE_URL en .env).",
    };
  }
  /* undefined_column — suele ser migración 004 (due_date, metas, etc.) no aplicada */
  if (e.code === "42703") {
    return {
      error:
        "Falta actualizar la base de datos (hay columnas o tablas nuevas). Pará la API, abrí una terminal en la raíz del proyecto y ejecutá: npm run db:migrate. Luego volvé a levantar la API.",
    };
  }
  if (msgLower.includes("column") && msgLower.includes("does not exist")) {
    return {
      error:
        "La estructura de la base no coincide con la versión del código. Ejecutá: npm run db:migrate (en la raíz del proyecto, con .env y DATABASE_URL configurados).",
    };
  }

  if (e.code === "3D000" || (msgLower.includes("database") && msgLower.includes("does not exist"))) {
    return { error: "La base de datos indicada en DATABASE_URL no existe o el nombre es incorrecto." };
  }
  if (
    e.code === "28P01" ||
    msgLower.includes("password authentication failed") ||
    msgLower.includes("authentication failed")
  ) {
    return { error: "Usuario o contraseña de PostgreSQL incorrectos (revisá DATABASE_URL)." };
  }
  if (e.code === "ECONNREFUSED") {
    return {
      error:
        "No hay conexión con PostgreSQL. Comprobá que el servidor esté en marcha y el puerto en DATABASE_URL.",
    };
  }
  if (e.code === "ENETUNREACH" || e.code === "EHOSTUNREACH" || msgLower.includes("enetunreach")) {
    return {
      error:
        "No se alcanza el servidor de la base (red o IPv6). En Railway usá la URL interna de Postgres del mismo proyecto o el hostname pooler de tu proveedor; el código ya prioriza IPv4 al arrancar.",
    };
  }
  if (e.code === "ENOTFOUND") {
    return { error: "No se resuelve el host de la base de datos. Revisá DATABASE_URL." };
  }
  if (e.code === "ETIMEDOUT" || msgLower.includes("timeout")) {
    return { error: "Tiempo de espera agotado al conectar con la base de datos." };
  }
  if (
    msgLower.includes("ssl") ||
    msgLower.includes("certificate") ||
    msgLower.includes("tls") ||
    e.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    e.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ) {
    return {
      error:
        "Problema de SSL/TLS con PostgreSQL. Probá agregar a DATABASE_URL: ?sslmode=require (o sslmode=no-verify solo para pruebas).",
    };
  }

  if (isDev && err instanceof Error && err.message) {
    return { error: "Error interno", detail: err.message };
  }
  return { error: "Error interno" };
}
