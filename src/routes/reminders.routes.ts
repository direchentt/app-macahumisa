import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getListAccess, isListParticipant, isListOwner } from "../lib/sharedListAccess.js";
import { processDueReminders } from "../lib/processDueReminders.js";

const uuid = z.string().uuid();

const repeatKind = z.enum(["none", "daily", "weekly", "monthly"]);
const reminderKind = z.enum(["reminder", "expiration", "agenda", "routine"]);

const createBody = z
  .object({
    title: z.string().min(1).max(255),
    body: z.string().max(5000).optional().nullable(),
    remind_at: z.string().min(1),
    ends_at: z.string().min(1).optional().nullable(),
    repeat_kind: repeatKind.optional(),
    reminder_kind: reminderKind.optional(),
    meta: z.record(z.unknown()).optional().nullable(),
    shared_list_id: z.string().uuid().optional().nullable(),
  })
  .strict();

const patchBody = createBody.partial().extend({ completed_at: z.boolean().optional() }).strict();

export type ReminderRowOut = {
  id: string;
  user_id: string;
  shared_list_id: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  ends_at: string | null;
  repeat_kind: string;
  reminder_kind: string;
  meta: unknown;
  last_notified_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

async function assertListOptional(pool: Pool, userId: string, listId: string | null | undefined): Promise<void> {
  if (!listId) return;
  const access = await getListAccess(pool, listId, userId);
  if (!isListParticipant(access)) {
    throw Object.assign(new Error("Lista no encontrada"), { status: 404 });
  }
}

async function canEditReminder(
  pool: Pool,
  userId: string,
  row: { user_id: string; shared_list_id: string | null },
): Promise<boolean> {
  if (row.user_id === userId) return true;
  if (row.shared_list_id) {
    const access = await getListAccess(pool, row.shared_list_id, userId);
    return isListOwner(access);
  }
  return false;
}

export function remindersRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    try {
      await processDueReminders(pool, userId);
    } catch (e) {
      console.error("processDueReminders", e);
    }
    const { rows } = await pool.query<ReminderRowOut>(
      `SELECT r.id, r.user_id, r.shared_list_id, r.title, r.body,
              r.remind_at::text, r.ends_at::text, r.repeat_kind, r.reminder_kind, r.meta,
              r.last_notified_at::text, r.completed_at::text, r.created_at::text, r.updated_at::text
       FROM user_reminders r
       WHERE r.completed_at IS NULL
         AND (
           r.user_id = $1
           OR (
             r.shared_list_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM shared_lists sl
               LEFT JOIN memberships m ON m.list_id = sl.id AND m.user_id = $1
               WHERE sl.id = r.shared_list_id AND (sl.owner_id = $1 OR m.user_id IS NOT NULL)
             )
           )
         )
       ORDER BY r.remind_at ASC NULLS LAST, r.created_at DESC
       LIMIT 200`,
      [userId],
    );
    res.json({ reminders: rows });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    try {
      await assertListOptional(pool, userId, b.shared_list_id ?? null);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      res.status(err.status ?? 500).json({ error: err.message ?? "Error" });
      return;
    }
    const remindAt = new Date(b.remind_at);
    if (Number.isNaN(remindAt.getTime())) {
      res.status(400).json({ error: "remind_at inválido" });
      return;
    }
    let endsAt: string | null = null;
    if (b.ends_at) {
      const e = new Date(b.ends_at);
      if (Number.isNaN(e.getTime())) {
        res.status(400).json({ error: "ends_at inválido" });
        return;
      }
      endsAt = e.toISOString();
    }
    const { rows } = await pool.query<ReminderRowOut>(
      `INSERT INTO user_reminders (
         user_id, shared_list_id, title, body, remind_at, ends_at, repeat_kind, reminder_kind, meta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, user_id, shared_list_id, title, body,
         remind_at::text, ends_at::text, repeat_kind, reminder_kind, meta,
         last_notified_at::text, completed_at::text, created_at::text, updated_at::text`,
      [
        userId,
        b.shared_list_id ?? null,
        b.title.trim(),
        b.body?.trim() ?? null,
        remindAt.toISOString(),
        endsAt,
        b.repeat_kind ?? "none",
        b.reminder_kind ?? "reminder",
        b.meta != null ? JSON.stringify(b.meta) : null,
      ],
    );
    res.status(201).json({ reminder: rows[0] });
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
    const { userId } = req as AuthedRequest;
    const { rows: existing } = await pool.query<{ user_id: string; shared_list_id: string | null }>(
      `SELECT user_id, shared_list_id FROM user_reminders WHERE id = $1 AND completed_at IS NULL`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (!(await canEditReminder(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const b = parsed.data;
    try {
      if (b.shared_list_id !== undefined) await assertListOptional(pool, userId, b.shared_list_id);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      res.status(err.status ?? 500).json({ error: err.message ?? "Error" });
      return;
    }

    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let n = 1;
    const add = (col: string, v: unknown) => {
      sets.push(`${col} = $${n++}`);
      vals.push(v);
    };

    if (b.title !== undefined) add("title", b.title.trim());
    if (b.body !== undefined) add("body", b.body?.trim() ?? null);
    if (b.remind_at !== undefined) {
      const d = new Date(b.remind_at);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "remind_at inválido" });
        return;
      }
      add("remind_at", d.toISOString());
      add("last_notified_at", null);
    }
    if (b.ends_at !== undefined) {
      if (b.ends_at === null) add("ends_at", null);
      else {
        const d = new Date(b.ends_at);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "ends_at inválido" });
          return;
        }
        add("ends_at", d.toISOString());
      }
    }
    if (b.repeat_kind !== undefined) add("repeat_kind", b.repeat_kind);
    if (b.reminder_kind !== undefined) add("reminder_kind", b.reminder_kind);
    if (b.meta !== undefined) {
      sets.push(`meta = $${n}::jsonb`);
      vals.push(b.meta == null ? null : JSON.stringify(b.meta));
      n += 1;
    }
    if (b.shared_list_id !== undefined) add("shared_list_id", b.shared_list_id);
    if (b.completed_at === true) sets.push("completed_at = now()");

    vals.push(idParse.data);
    const { rows } = await pool.query<ReminderRowOut>(
      `UPDATE user_reminders SET ${sets.join(", ")} WHERE id = $${n}
       RETURNING id, user_id, shared_list_id, title, body,
         remind_at::text, ends_at::text, repeat_kind, reminder_kind, meta,
         last_notified_at::text, completed_at::text, created_at::text, updated_at::text`,
      vals,
    );
    res.json({ reminder: rows[0] });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows: existing } = await pool.query<{ user_id: string; shared_list_id: string | null }>(
      `SELECT user_id, shared_list_id FROM user_reminders WHERE id = $1`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (!(await canEditReminder(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    await pool.query(`DELETE FROM user_reminders WHERE id = $1`, [idParse.data]);
    res.status(204).send();
  });

  /** Marca hecho: si repite, calcula próxima fecha; si no, completa. */
  r.post("/:id/complete", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows: existing } = await pool.query<{
      user_id: string;
      shared_list_id: string | null;
      repeat_kind: string;
      remind_at: string;
    }>(
      `SELECT user_id, shared_list_id, repeat_kind, remind_at::text FROM user_reminders WHERE id = $1 AND completed_at IS NULL`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (!(await canEditReminder(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    if (row.repeat_kind === "none") {
      await pool.query(
        `UPDATE user_reminders SET completed_at = now(), updated_at = now(), last_notified_at = now() WHERE id = $1`,
        [idParse.data],
      );
    } else {
      const cur = new Date(row.remind_at);
      const addInterval = (from: Date, kind: string): Date => {
        const d = new Date(from.getTime());
        if (kind === "daily") d.setUTCDate(d.getUTCDate() + 1);
        else if (kind === "weekly") d.setUTCDate(d.getUTCDate() + 7);
        else if (kind === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
        return d;
      };
      let next = addInterval(cur, row.repeat_kind);
      const nowMs = Date.now();
      while (next.getTime() <= nowMs) {
        next = addInterval(next, row.repeat_kind);
      }
      await pool.query(
        `UPDATE user_reminders SET remind_at = $2, last_notified_at = NULL, updated_at = now() WHERE id = $1`,
        [idParse.data, next.toISOString()],
      );
    }
    const { rows } = await pool.query<ReminderRowOut>(
      `SELECT id, user_id, shared_list_id, title, body,
              remind_at::text, ends_at::text, repeat_kind, reminder_kind, meta,
              last_notified_at::text, completed_at::text, created_at::text, updated_at::text
       FROM user_reminders WHERE id = $1`,
      [idParse.data],
    );
    res.json({ reminder: rows[0] });
  });

  return r;
}
