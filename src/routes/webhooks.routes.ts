import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const putBody = z
  .object({
    url: z.string().url().max(2000),
  })
  .strict();

export function webhooksRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<{ url: string }>(
      `SELECT url FROM user_webhooks WHERE user_id = $1`,
      [userId],
    );
    res.json({ webhook: rows[0] ?? null });
  });

  r.put("/", auth, async (req, res) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const url = parsed.data.url.trim();
    const { rows } = await pool.query<{ url: string; updated_at: string }>(
      `INSERT INTO user_webhooks (user_id, url)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now()
       RETURNING url, updated_at`,
      [userId, url],
    );
    res.json({ webhook: rows[0] });
  });

  r.delete("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    await pool.query(`DELETE FROM user_webhooks WHERE user_id = $1`, [userId]);
    res.status(204).send();
  });

  return r;
}
