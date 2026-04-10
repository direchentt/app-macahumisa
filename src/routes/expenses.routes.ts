import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const uuid = z.string().uuid();

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().max(50).optional(),
  is_income: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createExpense = z
  .object({
    amount: z.coerce.number().finite(),
    currency: z.string().length(3),
    date: z.string(),
    category: z.string().max(50).optional().nullable(),
    description: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional().nullable(),
    source: z.string().max(50).optional().nullable(),
    is_income: z.boolean().optional(),
    is_recurring: z.boolean().optional(),
    recurring_frequency: z.string().max(20).optional().nullable(),
    merchant: z.string().max(255).optional().nullable(),
    receipt_url: z.string().url().optional().nullable(),
    status: z.string().max(20).optional().nullable(),
    shared_with: z.array(z.string()).optional(),
  })
  .strict();

const patchExpense = createExpense.partial();

export type ExpenseRow = {
  id: string;
  user_id: string;
  amount: string;
  currency: string;
  category: string | null;
  description: string | null;
  date: string;
  tags: string[] | null;
  notes: string | null;
  source: string | null;
  is_income: boolean;
  is_recurring: boolean;
  recurring_frequency: string | null;
  merchant: string | null;
  receipt_url: string | null;
  status: string | null;
  shared_with: string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export function expensesRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { from, to, category, is_income, limit, offset } = q.data;
    const cond: string[] = ["user_id = $1", "deleted_at IS NULL"];
    const params: unknown[] = [userId];
    let n = 2;

    if (from) {
      cond.push(`date >= $${n++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      cond.push(`date <= $${n++}::timestamptz`);
      params.push(to);
    }
    if (category !== undefined && category !== "") {
      cond.push(`category = $${n++}`);
      params.push(category);
    }
    if (is_income !== undefined) {
      cond.push(`is_income = $${n++}`);
      params.push(is_income === "true");
    }

    params.push(limit, offset);
    const limIdx = n++;
    const offIdx = n;
    const sql = `SELECT id, user_id, amount::text, currency, category, description, date, tags, notes, source,
                        is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
                        created_at, updated_at, deleted_at
                 FROM expenses WHERE ${cond.join(" AND ")}
                 ORDER BY date DESC, created_at DESC
                 LIMIT $${limIdx} OFFSET $${offIdx}`;
    const { rows } = await pool.query<ExpenseRow>(sql, params);
    res.json({ expenses: rows, limit, offset });
  });

  r.get("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<ExpenseRow>(
      `SELECT id, user_id, amount::text, currency, category, description, date, tags, notes, source,
              is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
              created_at, updated_at, deleted_at
       FROM expenses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [idParse.data, userId],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    res.json({ expense: row });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createExpense.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    const dateVal = new Date(b.date);
    if (Number.isNaN(dateVal.getTime())) {
      res.status(400).json({ error: "date inválida" });
      return;
    }
    const { rows } = await pool.query<ExpenseRow>(
      `INSERT INTO expenses (
         user_id, amount, currency, category, description, date, tags, notes, source,
         is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )
       RETURNING id, user_id, amount::text, currency, category, description, date, tags, notes, source,
                 is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
                 created_at, updated_at, deleted_at`,
      [
        userId,
        b.amount,
        b.currency.toUpperCase(),
        b.category ?? null,
        b.description ?? null,
        dateVal.toISOString(),
        b.tags ?? null,
        b.notes ?? null,
        b.source ?? null,
        b.is_income ?? false,
        b.is_recurring ?? false,
        b.recurring_frequency ?? null,
        b.merchant ?? null,
        b.receipt_url ?? null,
        b.status ?? null,
        b.shared_with ?? null,
      ],
    );
    res.status(201).json({ expense: rows[0] });
  });

  r.patch("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = patchExpense.safeParse(req.body);
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
      if (k === "date" && typeof v === "string") {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "date inválida" });
          return;
        }
        v = d.toISOString() as unknown as typeof v;
      }
      setParts.push(`${k} = $${i++}`);
      values.push(v);
    }
    setParts.push(`updated_at = now()`);
    values.push(idParse.data, userId);
    const sql = `UPDATE expenses SET ${setParts.join(", ")}
                 WHERE id = $${i++} AND user_id = $${i} AND deleted_at IS NULL
                 RETURNING id, user_id, amount::text, currency, category, description, date, tags, notes, source,
                           is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
                           created_at, updated_at, deleted_at`;
    const { rows } = await pool.query<ExpenseRow>(sql, values);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    res.json({ expense: row });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rowCount } = await pool.query(
      `UPDATE expenses SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [idParse.data, userId],
    );
    if (!rowCount) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
