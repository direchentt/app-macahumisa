import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getListAccess, isListParticipant, canCreateExpenseOnList } from "../lib/sharedListAccess.js";

const uuid = z.string().uuid();

const createBody = z
  .object({
    content: z.string().min(1).max(20000),
    shared_list_id: z.string().uuid().optional().nullable(),
    pinned: z.boolean().optional(),
  })
  .strict();

const patchBody = z
  .object({
    content: z.string().min(1).max(20000).optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

export type UserNoteRow = {
  id: string;
  user_id: string;
  shared_list_id: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

async function canEditNote(
  pool: Pool,
  userId: string,
  row: { user_id: string; shared_list_id: string | null },
): Promise<boolean> {
  if (!row.shared_list_id) return row.user_id === userId;
  const access = await getListAccess(pool, row.shared_list_id, userId);
  return canCreateExpenseOnList(access);
}

export function notesRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const listParam = typeof req.query.shared_list_id === "string" ? req.query.shared_list_id : undefined;
    let listId: string | null | undefined =
      listParam === undefined ? undefined : listParam === "" || listParam === "personal" ? null : listParam;
    if (listParam && listParam !== "personal") {
      const p = uuid.safeParse(listParam);
      if (!p.success) {
        res.status(400).json({ error: "shared_list_id inválido" });
        return;
      }
      listId = p.data;
    }
    if (listId) {
      const access = await getListAccess(pool, listId, userId);
      if (!isListParticipant(access)) {
        res.status(404).json({ error: "Lista no encontrada" });
        return;
      }
    }

    const { rows } = await pool.query<UserNoteRow>(
      listId
        ? `SELECT id, user_id, shared_list_id, content, pinned, created_at::text, updated_at::text
           FROM user_notes WHERE shared_list_id = $1
           ORDER BY pinned DESC, updated_at DESC`
        : `SELECT id, user_id, shared_list_id, content, pinned, created_at::text, updated_at::text
           FROM user_notes WHERE user_id = $1 AND shared_list_id IS NULL
           ORDER BY pinned DESC, updated_at DESC`,
      listId ? [listId] : [userId],
    );
    res.json({ notes: rows });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    const listId = b.shared_list_id ?? null;
    if (listId) {
      const access = await getListAccess(pool, listId, userId);
      if (!isListParticipant(access)) {
        res.status(404).json({ error: "Lista no encontrada" });
        return;
      }
      if (!canCreateExpenseOnList(access)) {
        res.status(403).json({ error: "Solo dueño o editores pueden crear notas" });
        return;
      }
    }
    const { rows } = await pool.query<UserNoteRow>(
      `INSERT INTO user_notes (user_id, shared_list_id, content, pinned)
       VALUES ($1, $2, $3, COALESCE($4, false))
       RETURNING id, user_id, shared_list_id, content, pinned, created_at::text, updated_at::text`,
      [userId, listId, b.content.trim(), b.pinned ?? null],
    );
    res.status(201).json({ note: rows[0] });
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
      `SELECT user_id, shared_list_id FROM user_notes WHERE id = $1`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (!(await canEditNote(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const b = parsed.data;
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let n = 1;
    if (b.content !== undefined) {
      sets.push(`content = $${n++}`);
      vals.push(b.content.trim());
    }
    if (b.pinned !== undefined) {
      sets.push(`pinned = $${n++}`);
      vals.push(b.pinned);
    }
    vals.push(idParse.data);
    const { rows } = await pool.query<UserNoteRow>(
      `UPDATE user_notes SET ${sets.join(", ")} WHERE id = $${n}
       RETURNING id, user_id, shared_list_id, content, pinned, created_at::text, updated_at::text`,
      vals,
    );
    res.json({ note: rows[0] });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows: existing } = await pool.query<{ user_id: string; shared_list_id: string | null }>(
      `SELECT user_id, shared_list_id FROM user_notes WHERE id = $1`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (!(await canEditNote(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    await pool.query(`DELETE FROM user_notes WHERE id = $1`, [idParse.data]);
    res.status(204).send();
  });

  return r;
}
