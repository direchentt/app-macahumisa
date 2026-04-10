import pg from "pg";
import { parseIntoClientConfig } from "pg-connection-string";
import type { Env } from "../config/env.js";

/**
 * Con `connectionString` + `ssl` en el mismo Pool, node-pg hace merge con el parse de la URL y
 * `sslmode=require` puede pisar `rejectUnauthorized` (típico con Supabase).
 * Para Supabase armamos ClientConfig explícito con SSL relajado.
 * DATABASE_SSL_REJECT_UNAUTHORIZED=0|1 fuerza el modo en cualquier host.
 */
export function createPool(env: Env) {
  const cs = env.DATABASE_URL;
  const ex = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  const parsed = parseIntoClientConfig(cs);
  const host = String(parsed.host ?? "").toLowerCase();
  const supabase = host.includes("supabase.co") || host.includes("pooler.supabase.com");

  const relax =
    ex === "0" ||
    ex === "false" ||
    supabase;
  const strict = ex === "1" || ex === "true";

  if (relax && !strict) {
    return new pg.Pool({
      ...parsed,
      ssl: { rejectUnauthorized: false },
    });
  }
  if (strict) {
    return new pg.Pool({
      ...parsed,
      ssl: { rejectUnauthorized: true },
    });
  }

  return new pg.Pool({ connectionString: cs });
}
