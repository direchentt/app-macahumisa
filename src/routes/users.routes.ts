import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { EXPENSE_VISIBILITY_SQL } from "../lib/expenseVisibilitySql.js";
import { importUserBackup } from "../services/importUserBackup.js";

const EXPENSE_BACKUP_SELECT = `e.id, e.user_id, e.amount::text, e.currency, e.category, e.description, e.date::text, e.tags, e.notes, e.source,
  e.is_income, e.is_recurring, e.recurring_frequency, e.merchant, e.receipt_url, e.status, e.shared_with,
  e.shared_list_id, e.due_date::text, e.created_at::text, e.updated_at::text, e.deleted_at::text`;

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

  /** Respaldo JSON de los datos visibles para el usuario (gastos, presupuestos, metas, listas, reglas, webhook). */
  r.get("/me/backup", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const exported_at = new Date().toISOString();
    const [
      userRow,
      expenseRows,
      budgetRows,
      goalRows,
      listRows,
      ruleRows,
      webhookRows,
      membershipRows,
    ] = await Promise.all([
      pool.query<PublicUser>(
        `SELECT id, email, first_name, last_name, profile_picture_url, currency, timezone, language, dark_mode, created_at, updated_at
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      ),
      pool.query(
        `SELECT ${EXPENSE_BACKUP_SELECT}
         FROM expenses e
         WHERE ${EXPENSE_VISIBILITY_SQL}
         ORDER BY e.date DESC NULLS LAST, e.created_at DESC`,
        [userId],
      ),
      pool.query(
        `SELECT id, user_id, limit_amount::text, category, period, alert_threshold, created_at, updated_at
         FROM budgets WHERE user_id = $1 ORDER BY category ASC`,
        [userId],
      ),
      pool.query(
        `SELECT id, user_id, name, target_amount::text, saved_amount::text, currency, deadline::text, created_at, updated_at
         FROM savings_goals WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      pool.query(
        `SELECT DISTINCT sl.id, sl.owner_id, sl.name, sl.description, sl.created_at, sl.updated_at
         FROM shared_lists sl
         LEFT JOIN memberships m ON m.list_id = sl.id
         WHERE sl.owner_id = $1 OR m.user_id = $1
         ORDER BY sl.updated_at DESC`,
        [userId],
      ),
      pool.query(
        `SELECT id, user_id, pattern, category, created_at FROM category_rules WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId],
      ),
      pool.query(`SELECT url, created_at, updated_at FROM user_webhooks WHERE user_id = $1`, [userId]),
      pool.query(
        `SELECT m.id, m.user_id, m.list_id, m.role, m.joined_at
         FROM memberships m
         WHERE m.user_id = $1`,
        [userId],
      ),
    ]);

    const u = userRow.rows[0];
    if (!u) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    res.json({
      backup_version: 1,
      exported_at,
      user: u,
      expenses: expenseRows.rows,
      budgets: budgetRows.rows,
      savings_goals: goalRows.rows,
      shared_lists: listRows.rows,
      category_rules: ruleRows.rows,
      webhook: webhookRows.rows[0] ?? null,
      memberships: membershipRows.rows,
    });
  });

  const importBackupBody = z
    .object({
      data: z.unknown(),
      on_conflict: z.enum(["skip", "overwrite"]).optional().default("skip"),
      replace_category_rules: z.boolean().optional().default(false),
    })
    .strict();

  /** Importar un JSON exportado con GET /me/backup (misma cuenta). */
  r.post("/me/backup/import", auth, async (req, res) => {
    const parsed = importBackupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    try {
      const summary = await importUserBackup(pool, userId, b.data, {
        onConflict: b.on_conflict,
        replaceCategoryRules: b.replace_category_rules,
      });
      res.json({ ok: true, summary });
    } catch (e) {
      const err = e as Error & { status?: number; zod?: unknown };
      if (err.status === 400) {
        res.status(400).json({ error: err.message, zod: err.zod });
        return;
      }
      if (err.status === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
      throw e;
    }
  });

  return r;
}
