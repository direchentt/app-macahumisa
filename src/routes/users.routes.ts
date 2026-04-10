import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const patchMe = z
  .object({
    first_name: z.string().max(100).nullable().optional(),
    last_name: z.string().max(100).nullable().optional(),
    currency: z.string().length(3).optional(),
    timezone: z.string().max(50).nullable().optional(),
    language: z.string().max(10).nullable().optional(),
    dark_mode: z.boolean().optional(),
    profile_picture_url: z.string().url().nullable().optional(),
  })
  .strict();

export type PublicUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  currency: string;
  timezone: string | null;
  language: string | null;
  dark_mode: boolean;
  created_at: string;
  updated_at: string;
};

export function usersRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/me", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<PublicUser & { deleted_at: Date | null }>(
      `SELECT id, email, first_name, last_name, profile_picture_url, currency, timezone, language,
              dark_mode, created_at, updated_at, deleted_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u || u.deleted_at) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    const { deleted_at: _d, ...publicUser } = u;
    res.json({ user: publicUser });
  });

  r.patch("/me", auth, async (req, res) => {
    const parsed = patchMe.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const fields = parsed.data;
    const keys = Object.keys(fields) as (keyof typeof fields)[];
    if (keys.length === 0) {
      res.status(400).json({ error: "Sin campos para actualizar" });
      return;
    }
    const setParts: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const k of keys) {
      setParts.push(`${k} = $${i++}`);
      values.push(fields[k]);
    }
    setParts.push(`updated_at = now()`);
    values.push(userId);
    const sql = `UPDATE users SET ${setParts.join(", ")} WHERE id = $${i} AND deleted_at IS NULL
                 RETURNING id, email, first_name, last_name, profile_picture_url, currency, timezone, language,
                           dark_mode, created_at, updated_at`;
    const { rows } = await pool.query<PublicUser>(sql, values);
    const u = rows[0];
    if (!u) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json({ user: u });
  });

  return r;
}
