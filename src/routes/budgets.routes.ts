import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { periodBounds } from "../lib/period.js";

const uuid = z.string().uuid();

const createBudget = z
  .object({
    category: z.string().max(50),
    limit_amount: z.coerce.number().finite().positive(),
    period: z.string().max(20),
    alert_threshold: z.coerce.number().int().min(0).max(100).optional().nullable(),
  })
  .strict();

const patchBudget = createBudget.partial();

export type BudgetRow = {
  id: string;
  user_id: string;
  category: string;
  limit_amount: string;
  period: string;
  alert_threshold: number | null;
  created_at: string;
  updated_at: string;
};

export function budgetsRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<BudgetRow>(
      `SELECT id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at
       FROM budgets WHERE user_id = $1 ORDER BY category ASC, created_at DESC`,
      [userId],
    );
    res.json({ budgets: rows });
  });

  r.get("/:id/usage", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<BudgetRow>(
      `SELECT id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at
       FROM budgets WHERE id = $1 AND user_id = $2`,
      [idParse.data, userId],
    );
    const budget = rows[0];
    if (!budget) {
      res.status(404).json({ error: "Presupuesto no encontrado" });
      return;
    }
    const { start, end } = periodBounds(budget.period);
    const sum = await pool.query<{ spent: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS spent
       FROM expenses
       WHERE user_id = $1 AND deleted_at IS NULL AND is_income = false
         AND category = $2 AND date >= $3 AND date < $4`,
      [userId, budget.category, start.toISOString(), end.toISOString()],
    );
    const spent = sum.rows[0]?.spent ?? "0";
    const limit = budget.limit_amount;
    const spentNum = Number(spent);
    const limitNum = Number(limit);
    const remaining = limitNum - spentNum;
    const percentUsed = limitNum > 0 ? Math.round((spentNum / limitNum) * 1000) / 10 : 0;
    res.json({
      budget_id: budget.id,
      category: budget.category,
      period: budget.period,
      range: { start: start.toISOString(), end: end.toISOString() },
      limit_amount: limit,
      spent,
      remaining: String(Math.round(remaining * 100) / 100),
      percent_used: percentUsed,
      alert_threshold: budget.alert_threshold,
      over_limit: spentNum > limitNum,
    });
  });

  r.get("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<BudgetRow>(
      `SELECT id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at
       FROM budgets WHERE id = $1 AND user_id = $2`,
      [idParse.data, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Presupuesto no encontrado" });
      return;
    }
    res.json({ budget: row });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createBudget.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    const { rows } = await pool.query<BudgetRow>(
      `INSERT INTO budgets (user_id, category, limit_amount, period, alert_threshold)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at`,
      [userId, b.category, b.limit_amount, b.period, b.alert_threshold ?? null],
    );
    res.status(201).json({ budget: rows[0] });
  });

  r.patch("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = patchBudget.safeParse(req.body);
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
      setParts.push(`${k} = $${i++}`);
      values.push(body[k]);
    }
    setParts.push(`updated_at = now()`);
    values.push(idParse.data, userId);
    const sql = `UPDATE budgets SET ${setParts.join(", ")}
                 WHERE id = $${i++} AND user_id = $${i}
                 RETURNING id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at`;
    const { rows } = await pool.query<BudgetRow>(sql, values);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Presupuesto no encontrado" });
      return;
    }
    res.json({ budget: row });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rowCount } = await pool.query(`DELETE FROM budgets WHERE id = $1 AND user_id = $2`, [
      idParse.data,
      userId,
    ]);
    if (!rowCount) {
      res.status(404).json({ error: "Presupuesto no encontrado" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
