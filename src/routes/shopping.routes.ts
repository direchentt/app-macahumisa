import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getListAccess, isListParticipant, isListOwner, canCreateExpenseOnList } from "../lib/sharedListAccess.js";

const uuid = z.string().uuid();

const createBody = z
  .object({
    label: z.string().min(1).max(500),
    shared_list_id: z.string().uuid().optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .strict();

const patchBody = z
  .object({
    label: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

export type ShoppingItemRow = {
  id: string;
  user_id: string;
  shared_list_id: string | null;
  label: string;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function assertShoppingScope(pool: Pool, userId: string, listId: string | null): Promise<void> {
  if (!listId) return;
  const access = await getListAccess(pool, listId, userId);
  if (!isListParticipant(access)) {
    throw Object.assign(new Error("Lista no encontrada"), { status: 404 });
  }
}

async function canMutateItem(
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

export function shoppingRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const listParam = typeof req.query.shared_list_id === "string" ? req.query.shared_list_id : undefined;
    let listId: string | null | undefined = listParam === "" || listParam === "personal" ? null : listParam;
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

    const { rows } = await pool.query<ShoppingItemRow>(
      listId
        ? `SELECT id, user_id, shared_list_id, label, done, sort_order, created_at::text, updated_at::text
           FROM shopping_items WHERE shared_list_id = $1
           ORDER BY sort_order ASC, created_at ASC`
        : `SELECT id, user_id, shared_list_id, label, done, sort_order, created_at::text, updated_at::text
           FROM shopping_items WHERE user_id = $1 AND shared_list_id IS NULL
           ORDER BY sort_order ASC, created_at ASC`,
      listId ? [listId] : [userId],
    );
    res.json({ items: rows });
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
    try {
      await assertShoppingScope(pool, userId, listId);
      if (listId) {
        const access = await getListAccess(pool, listId, userId);
        if (!canCreateExpenseOnList(access)) {
          res.status(403).json({ error: "Solo el dueño o editores pueden agregar ítems" });
          return;
        }
      }
    } catch (e) {
      const err = e as { status?: number; message?: string };
      res.status(err.status ?? 500).json({ error: err.message ?? "Error" });
      return;
    }
    const { rows } = await pool.query<ShoppingItemRow>(
      `INSERT INTO shopping_items (user_id, shared_list_id, label, sort_order)
       VALUES ($1, $2, $3, COALESCE($4, 0))
       RETURNING id, user_id, shared_list_id, label, done, sort_order, created_at::text, updated_at::text`,
      [userId, listId, b.label.trim(), b.sort_order ?? null],
    );
    res.status(201).json({ item: rows[0] });
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
      `SELECT user_id, shared_list_id FROM shopping_items WHERE id = $1`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    const accessList = row.shared_list_id ? await getListAccess(pool, row.shared_list_id, userId) : null;
    if (row.shared_list_id && isListParticipant(accessList)) {
      if (!canCreateExpenseOnList(accessList)) {
        res.status(403).json({ error: "Los visualizadores no pueden editar la lista de compras" });
        return;
      }
    } else if (!(await canMutateItem(pool, userId, row))) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }

    const b = parsed.data;
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let n = 1;
    if (b.label !== undefined) {
      sets.push(`label = $${n++}`);
      vals.push(b.label.trim());
    }
    if (b.done !== undefined) {
      sets.push(`done = $${n++}`);
      vals.push(b.done);
    }
    if (b.sort_order !== undefined) {
      sets.push(`sort_order = $${n++}`);
      vals.push(b.sort_order);
    }
    vals.push(idParse.data);
    const { rows } = await pool.query<ShoppingItemRow>(
      `UPDATE shopping_items SET ${sets.join(", ")} WHERE id = $${n}
       RETURNING id, user_id, shared_list_id, label, done, sort_order, created_at::text, updated_at::text`,
      vals,
    );
    res.json({ item: rows[0] });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rows: existing } = await pool.query<{ user_id: string; shared_list_id: string | null }>(
      `SELECT user_id, shared_list_id FROM shopping_items WHERE id = $1`,
      [idParse.data],
    );
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (row.shared_list_id) {
      const access = await getListAccess(pool, row.shared_list_id, userId);
      if (!canCreateExpenseOnList(access)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
    } else if (row.user_id !== userId) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    await pool.query(`DELETE FROM shopping_items WHERE id = $1`, [idParse.data]);
    res.status(204).send();
  });

  return r;
}
