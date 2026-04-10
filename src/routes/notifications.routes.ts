import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const uuid = z.string().uuid();

const listQuery = z.object({
  unread_only: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export function notificationsRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.post("/read-all", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
      userId,
    ]);
    res.status(204).send();
  });

  r.get("/", auth, async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { unread_only, limit, offset } = q.data;
    const parts = ["user_id = $1"];
    if (unread_only === "true") {
      parts.push("read_at IS NULL");
    }
    const where = parts.join(" AND ");
    const params: unknown[] = [userId, limit, offset];
    const sql = `SELECT id, user_id, type, title, body, payload, read_at, created_at
                 FROM notifications WHERE ${where}
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`;
    const { rows } = await pool.query<NotificationRow>(sql, params);

    const { rows: countRows } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    const unread_count = Number(countRows[0]?.c ?? 0);

    res.json({ notifications: rows, unread_count, limit, offset });
  });

  r.patch("/:id/read", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<NotificationRow>(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, type, title, body, payload, read_at, created_at`,
      [idParse.data, userId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Notificación no encontrada" });
      return;
    }
    res.json({ notification: rows[0] });
  });

  return r;
}
