import { Router } from "express";
import type { Pool } from "pg";
import { mapServerError } from "../lib/mapServerError.js";

export function healthRouter(pool: Pool) {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/health/db", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, database: "up" });
    } catch (e) {
      const { error } = mapServerError(e, false);
      res.status(503).json({ ok: false, database: "down", error });
    }
  });

  return r;
}
