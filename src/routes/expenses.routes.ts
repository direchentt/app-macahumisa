import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  canCreateExpenseOnList,
  canMutateExpense,
  getListAccess,
} from "../lib/sharedListAccess.js";
import { notifySharedExpenseCreated } from "../services/notifySharedExpense.js";
import { pickCategoryFromRules } from "../lib/categoryRuleMatch.js";
import { dispatchUserWebhook } from "../services/dispatchUserWebhook.js";

const uuid = z.string().uuid();

/** Visibilidad: personales del usuario o gastos de listas donde participa. Usa $1 = userId JWT. */
const EXPENSE_VISIBILITY_SQL = `(
  (e.shared_list_id IS NULL AND e.user_id = $1)
  OR (
    e.shared_list_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shared_lists sl
      LEFT JOIN memberships m ON m.list_id = sl.id AND m.user_id = $1
      WHERE sl.id = e.shared_list_id
        AND (sl.owner_id = $1 OR m.user_id IS NOT NULL)
    )
  )
)`;

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().max(50).optional(),
  is_income: z.enum(["true", "false"]).optional(),
  shared_list_id: z.string().uuid().optional(),
  personal_only: z.enum(["true"]).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
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
    shared_list_id: z.string().uuid().optional().nullable(),
    due_date: z.string().optional().nullable(),
  })
  .strict();

const patchExpense = createExpense.partial();

const expenseSelect = `e.id, e.user_id, e.amount::text, e.currency, e.category, e.description, e.date, e.tags, e.notes, e.source,
  e.is_income, e.is_recurring, e.recurring_frequency, e.merchant, e.receipt_url, e.status, e.shared_with,
  e.shared_list_id, e.due_date, e.created_at, e.updated_at, e.deleted_at`;

const expenseReturning = `id, user_id, amount::text, currency, category, description, date, tags, notes, source,
  is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
  shared_list_id, due_date, created_at, updated_at, deleted_at`;

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
  shared_list_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ListFilters = {
  from?: string;
  to?: string;
  category?: string;
  is_income?: "true" | "false";
  shared_list_id?: string;
  personal_only?: "true";
  q?: string;
};

function appendListFilters(
  extra: string[],
  params: unknown[],
  n: number,
  filters: ListFilters,
): number {
  let next = n;
  if (filters.from) {
    extra.push(`e.date >= $${next++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to) {
    extra.push(`e.date <= $${next++}::timestamptz`);
    params.push(filters.to);
  }
  if (filters.category !== undefined && filters.category !== "") {
    extra.push(`e.category = $${next++}`);
    params.push(filters.category);
  }
  if (filters.is_income !== undefined) {
    extra.push(`e.is_income = $${next++}`);
    params.push(filters.is_income === "true");
  }
  if (filters.personal_only === "true") {
    extra.push(`e.shared_list_id IS NULL`);
  } else if (filters.shared_list_id !== undefined) {
    extra.push(`e.shared_list_id = $${next++}`);
    params.push(filters.shared_list_id);
  }
  if (filters.q !== undefined && filters.q.trim() !== "") {
    const raw = filters.q.trim().replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "");
    if (raw.length > 0) {
      const term = `%${raw}%`;
      extra.push(
        `(e.description ILIKE $${next} OR e.category ILIKE $${next} OR COALESCE(e.notes, '') ILIKE $${next})`,
      );
      params.push(term);
      next += 1;
    }
  }
  return next;
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function expensesRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/export/csv", auth, async (req, res) => {
    const q = listQuery.omit({ limit: true, offset: true }).safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { from, to, category, is_income, shared_list_id: listFilter, personal_only, q: search } = q.data;
    const params: unknown[] = [userId];
    const extra: string[] = [];
    let n = appendListFilters(extra, params, 2, {
      from,
      to,
      category,
      is_income,
      shared_list_id: listFilter,
      personal_only,
      q: search,
    });
    const maxRows = 2000;
    params.push(maxRows);
    const limIdx = n;
    const where = [`e.deleted_at IS NULL`, EXPENSE_VISIBILITY_SQL, ...extra].join(" AND ");
    const sql = `SELECT e.date, e.amount::text, e.currency, e.category, e.description, e.is_income, e.shared_list_id, sl.name AS list_name
                 FROM expenses e
                 LEFT JOIN shared_lists sl ON sl.id = e.shared_list_id
                 WHERE ${where}
                 ORDER BY e.date DESC, e.created_at DESC
                 LIMIT $${limIdx}`;
    const { rows } = await pool.query<{
      date: string;
      amount: string;
      currency: string;
      category: string | null;
      description: string | null;
      is_income: boolean;
      list_name: string | null;
    }>(sql, params);
    const header = ["fecha", "importe", "moneda", "categoria", "nota", "ingreso", "lista"];
    const lines = [header.join(",")];
    for (const row of rows) {
      const d = new Date(row.date).toISOString();
      lines.push(
        [
          csvEscape(d),
          csvEscape(row.amount),
          csvEscape(row.currency),
          csvEscape(row.category ?? ""),
          csvEscape(row.description ?? ""),
          csvEscape(row.is_income ? "si" : "no"),
          csvEscape(row.list_name ?? ""),
        ].join(","),
      );
    }
    const bom = "\uFEFF";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="macahumisa-gastos.csv"');
    res.send(bom + lines.join("\n"));
  });

  r.get("/", auth, async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { from, to, category, is_income, shared_list_id: listFilter, personal_only, q: search, limit, offset } = q.data;
    const params: unknown[] = [userId];
    const extra: string[] = [];
    let n = appendListFilters(extra, params, 2, {
      from,
      to,
      category,
      is_income,
      shared_list_id: listFilter,
      personal_only,
      q: search,
    });
    params.push(limit, offset);
    const limIdx = n++;
    const offIdx = n;
    const where = [`e.deleted_at IS NULL`, EXPENSE_VISIBILITY_SQL, ...extra].join(" AND ");
    const sql = `SELECT ${expenseSelect}
                 FROM expenses e
                 WHERE ${where}
                 ORDER BY e.date DESC, e.created_at DESC
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
      `SELECT ${expenseSelect}
       FROM expenses e
       WHERE e.id = $2 AND e.deleted_at IS NULL AND ${EXPENSE_VISIBILITY_SQL}`,
      [userId, idParse.data],
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
    let sharedListId: string | null = b.shared_list_id ?? null;
    if (sharedListId) {
      const access = await getListAccess(pool, sharedListId, userId);
      if (!canCreateExpenseOnList(access)) {
        res.status(403).json({ error: "No podés cargar gastos en esta lista" });
        return;
      }
    }
    const dateVal = new Date(b.date);
    if (Number.isNaN(dateVal.getTime())) {
      res.status(400).json({ error: "date inválida" });
      return;
    }
    let dueDate: string | null = null;
    if (b.due_date && String(b.due_date).trim() !== "") {
      const dd = new Date(b.due_date);
      if (Number.isNaN(dd.getTime())) {
        res.status(400).json({ error: "due_date inválida" });
        return;
      }
      dueDate = dd.toISOString();
    }

    const { rows: ruleRows } = await pool.query<{ pattern: string; category: string }>(
      `SELECT pattern, category FROM category_rules WHERE user_id = $1 ORDER BY length(pattern) DESC`,
      [userId],
    );
    let categoryVal = b.category?.trim() ? b.category.trim() : null;
    if (!categoryVal) {
      categoryVal = pickCategoryFromRules(ruleRows, b.description, b.notes);
    }

    const { rows } = await pool.query<ExpenseRow>(
      `INSERT INTO expenses (
         user_id, amount, currency, category, description, date, tags, notes, source,
         is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with, shared_list_id, due_date
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
       )
       RETURNING ${expenseReturning}`,
      [
        userId,
        b.amount,
        b.currency.toUpperCase(),
        categoryVal,
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
        sharedListId,
        dueDate,
      ],
    );
    const expense = rows[0];
    if (sharedListId && expense) {
      void notifySharedExpenseCreated(pool, {
        expense: {
          id: expense.id,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          shared_list_id: sharedListId,
        },
        actorUserId: userId,
      }).catch((err) => console.error("notifySharedExpenseCreated", err));
    }
    if (expense) {
      void dispatchUserWebhook(pool, userId, "expense.created", {
        id: expense.id,
        amount: expense.amount,
        currency: expense.currency,
        category: expense.category,
        description: expense.description,
        date: expense.date,
        is_income: expense.is_income,
        shared_list_id: expense.shared_list_id,
      });
    }
    res.status(201).json({ expense });
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
    const { rows: existingRows } = await pool.query<ExpenseRow>(
      `SELECT ${expenseSelect}
       FROM expenses e
       WHERE e.id = $2 AND e.deleted_at IS NULL AND ${EXPENSE_VISIBILITY_SQL}`,
      [userId, idParse.data],
    );
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    if (!(await canMutateExpense(pool, userId, existing))) {
      res.status(403).json({ error: "No tenés permiso para editar este gasto" });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, "shared_list_id")) {
      const next = body.shared_list_id;
      if (next !== null && next !== undefined) {
        const access = await getListAccess(pool, next, userId);
        if (!canCreateExpenseOnList(access)) {
          res.status(403).json({ error: "No podés asignar este gasto a esa lista" });
          return;
        }
      }
    }
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
      if (k === "due_date") {
        if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
          v = null as unknown as typeof v;
        } else if (typeof v === "string") {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) {
            res.status(400).json({ error: "due_date inválida" });
            return;
          }
          v = d.toISOString() as unknown as typeof v;
        }
      }
      setParts.push(`${k} = $${i++}`);
      values.push(v);
    }
    setParts.push(`updated_at = now()`);
    values.push(idParse.data);
    const sql = `UPDATE expenses SET ${setParts.join(", ")}
                 WHERE id = $${i} AND deleted_at IS NULL
                 RETURNING ${expenseReturning}`;
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
    const { rows: existingRows } = await pool.query<{
      user_id: string;
      shared_list_id: string | null;
    }>(
      `SELECT e.user_id, e.shared_list_id FROM expenses e
       WHERE e.id = $2 AND e.deleted_at IS NULL AND ${EXPENSE_VISIBILITY_SQL}`,
      [userId, idParse.data],
    );
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    if (!(await canMutateExpense(pool, userId, existing))) {
      res.status(403).json({ error: "No tenés permiso para eliminar este gasto" });
      return;
    }
    const { rowCount } = await pool.query(
      `UPDATE expenses SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL`,
      [idParse.data],
    );
    if (!rowCount) {
      res.status(404).json({ error: "Gasto no encontrado" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
