import pg from "pg";
import type { Env } from "../config/env.js";

export function createPool(env: Env) {
  return new pg.Pool({ connectionString: env.DATABASE_URL });
}
