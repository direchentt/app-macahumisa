import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const uuid = z.string().uuid();

const createBody = z
  .object({
    name: z.string().min(1).max(200),
    target_amount: z.coerce.number().finite().positive(),
    saved_amount: z.coerce.number().finite().min(0).optional(),
    currency: z.string().length(3).optional(),
    deadline: z.string().optional().nullable(),
  })
  .strict();

const patchBody = createBody.partial();

export type SavingsGoalRow = {
  id: string;
  user_id: string;
  name: string;
  target_amount: string;
  saved_amount: string;
  currency: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

export function savingsGoalsRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<SavingsGoalRow>(
      `SELECT id, user_id, name, target_amount::text, saved_amount::text, currency, deadline::text, created_at, updated_at
       FROM savings_goals WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    res.json({ goals: rows });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    const cur = (b.currency ?? "USD").toUpperCase();
    const saved = b.saved_amount ?? 0;
    const { rows } = await pool.query<SavingsGoalRow>(
      `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, currency, deadline)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, name, target_amount::text, saved_amount::text, currency, deadline::text, created_at, updated_at`,
      [userId, b.name, b.target_amount, saved, cur, b.deadline ?? null],
    );
    res.status(201).json({ goal: rows[0] });
  });

  r.patch("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const keys = Object.keys(body) as (keyof typeof body)[];
    if (keys.length === 0) {
      res.status(400).json({ error: "Sin campos para actualizar" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const setParts: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const k of keys) {
      let v = body[k];
      if (k === "currency" && typeof v === "string") v = v.toUpperCase();
      setParts.push(`${k} = $${i++}`);
      values.push(v);
    }
    setParts.push(`updated_at = now()`);
    values.push(idParse.data, userId);
    const sql = `UPDATE savings_goals SET ${setParts.join(", ")}
                 WHERE id = $${i++} AND user_id = $${i}
                 RETURNING id, user_id, name, target_amount::text, saved_amount::text, currency, deadline::text, created_at, updated_at`;
    const { rows } = await pool.query<SavingsGoalRow>(sql, values);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Meta no encontrada" });
      return;
    }
    res.json({ goal: row });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rowCount } = await pool.query(`DELETE FROM savings_goals WHERE id = $1 AND user_id = $2`, [
      idParse.data,
      userId,
    ]);
    if (!rowCount) {
      res.status(404).json({ error: "Meta no encontrada" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
