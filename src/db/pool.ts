import pg from "pg";
import type { Env } from "../config/env.js";

/**
 * SSL para node-pg: el pooler de Supabase suele fallar con verify estricto desde Node/Docker (cadena / SNI).
 * DATABASE_SSL_REJECT_UNAUTHORIZED=0|1 fuerza el modo (cualquier host).
 */
function sslConfig(connectionString: string): pg.PoolConfig["ssl"] | undefined {
  const explicit = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  if (explicit === "0" || explicit === "false") {
    return { rejectUnauthorized: false };
  }
  if (explicit === "1" || explicit === "true") {
    return { rejectUnauthorized: true };
  }

  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  if (hostname.endsWith("pooler.supabase.com")) {
    return { rejectUnauthorized: false };
  }

  if (hostname.includes("supabase.com") || /sslmode=require|sslmode=verify-full/i.test(connectionString)) {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

export function createPool(env: Env) {
  const ssl = sslConfig(env.DATABASE_URL);
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    ...(ssl !== undefined ? { ssl } : {}),
  });
}
