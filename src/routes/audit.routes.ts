import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { EXPENSE_VISIBILITY_SQL } from "../lib/expenseVisibilitySql.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type AuditEntryRow = {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  entity_id: string;
  action: string;
  summary: string;
  changes: unknown;
  created_at: string;
};

export function auditRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  /** Historial de cambios en gastos que el usuario puede ver (personales o de listas compartidas). */
  r.get("/", auth, async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const limit = parsed.data.limit ?? 50;
    const offset = parsed.data.offset ?? 0;
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<AuditEntryRow>(
      `SELECT a.id, a.actor_user_id, u.email AS actor_email, a.entity_id, a.action, a.summary, a.changes, a.created_at
       FROM audit_log a
       INNER JOIN expenses e ON e.id = a.entity_id AND a.entity_type = 'expense'
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE ${EXPENSE_VISIBILITY_SQL}
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    res.json({ entries: rows });
  });

  return r;
}
