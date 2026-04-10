import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getListAccess, isListOwner, isListParticipant } from "../lib/sharedListAccess.js";

const uuid = z.string().uuid();

const roleSchema = z.enum(["editor", "viewer"]);

const createList = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(5000).optional().nullable(),
  })
  .strict();

const patchList = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
  })
  .strict();

const addMemberBody = z
  .object({
    email: z.string().email(),
    role: roleSchema.optional(),
  })
  .strict();

const patchMemberBody = z
  .object({
    role: roleSchema,
  })
  .strict();

export type SharedListRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipRow = {
  id: string;
  user_id: string;
  list_id: string;
  role: string;
  joined_at: string;
  email?: string;
};

export function sharedListsRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<SharedListRow>(
      `SELECT DISTINCT sl.id, sl.owner_id, sl.name, sl.description, sl.created_at, sl.updated_at
       FROM shared_lists sl
       LEFT JOIN memberships m ON m.list_id = sl.id
       WHERE sl.owner_id = $1 OR m.user_id = $1
       ORDER BY sl.updated_at DESC`,
      [userId],
    );
    res.json({ shared_lists: rows });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createList.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    const { rows } = await pool.query<SharedListRow>(
      `INSERT INTO shared_lists (owner_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, owner_id, name, description, created_at, updated_at`,
      [userId, b.name, b.description ?? null],
    );
    res.status(201).json({ shared_list: rows[0] });
  });

  r.get("/:id/members", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, idParse.data, userId);
    if (!isListParticipant(access)) {
      res.status(404).json({ error: "Lista no encontrada" });
      return;
    }
    const { rows } = await pool.query<MembershipRow & { email: string }>(
      `SELECT m.id, m.user_id, m.list_id, m.role, m.joined_at, u.email
       FROM memberships m
       JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
       WHERE m.list_id = $1
       ORDER BY m.joined_at ASC`,
      [idParse.data],
    );
    res.json({ members: rows });
  });

  r.post("/:id/members", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = addMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, idParse.data, userId);
    if (!isListOwner(access)) {
      res.status(403).json({ error: "Solo el dueño puede invitar miembros" });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const { rows: users } = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    const target = users[0];
    if (!target) {
      res.status(404).json({ error: "No hay usuario registrado con ese email" });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: "El dueño ya tiene acceso; no hace falta agregarlo" });
      return;
    }
    const { rows: owners } = await pool.query<{ owner_id: string }>(
      `SELECT owner_id FROM shared_lists WHERE id = $1`,
      [idParse.data],
    );
    if (owners[0]?.owner_id === target.id) {
      res.status(400).json({ error: "Ese usuario ya es el dueño" });
      return;
    }
    try {
      const { rows } = await pool.query<MembershipRow>(
        `INSERT INTO memberships (user_id, list_id, role)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, list_id, role, joined_at`,
        [target.id, idParse.data, parsed.data.role ?? "editor"],
      );
      await pool.query(`UPDATE shared_lists SET updated_at = now() WHERE id = $1`, [idParse.data]);
      res.status(201).json({ member: rows[0], email });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(409).json({ error: "Ese usuario ya es miembro" });
        return;
      }
      throw e;
    }
  });

  r.patch("/:id/members/:memberUserId", auth, async (req, res) => {
    const listId = uuid.safeParse(req.params.id);
    const memberUserId = uuid.safeParse(req.params.memberUserId);
    if (!listId.success || !memberUserId.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = patchMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, listId.data, userId);
    if (!isListOwner(access)) {
      res.status(403).json({ error: "Solo el dueño puede cambiar roles" });
      return;
    }
    const { rows } = await pool.query<MembershipRow>(
      `UPDATE memberships SET role = $1 WHERE list_id = $2 AND user_id = $3
       RETURNING id, user_id, list_id, role, joined_at`,
      [parsed.data.role, listId.data, memberUserId.data],
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Miembro no encontrado" });
      return;
    }
    await pool.query(`UPDATE shared_lists SET updated_at = now() WHERE id = $1`, [listId.data]);
    res.json({ member: rows[0] });
  });

  r.delete("/:id/members/:memberUserId", auth, async (req, res) => {
    const listId = uuid.safeParse(req.params.id);
    const memberUserId = uuid.safeParse(req.params.memberUserId);
    if (!listId.success || !memberUserId.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, listId.data, userId);
    if (!isListParticipant(access)) {
      res.status(404).json({ error: "Lista no encontrada" });
      return;
    }
    const isSelf = memberUserId.data === userId;
    if (!isSelf && !isListOwner(access)) {
      res.status(403).json({ error: "Solo podés salir de la lista o el dueño puede expulsar" });
      return;
    }
    const { rowCount } = await pool.query(
      `DELETE FROM memberships WHERE list_id = $1 AND user_id = $2`,
      [listId.data, memberUserId.data],
    );
    if (!rowCount) {
      res.status(404).json({ error: "Miembro no encontrado" });
      return;
    }
    await pool.query(`UPDATE shared_lists SET updated_at = now() WHERE id = $1`, [listId.data]);
    res.status(204).send();
  });

  r.get("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, idParse.data, userId);
    if (!isListParticipant(access)) {
      res.status(404).json({ error: "Lista no encontrada" });
      return;
    }
    const { rows } = await pool.query<SharedListRow>(
      `SELECT id, owner_id, name, description, created_at, updated_at
       FROM shared_lists WHERE id = $1`,
      [idParse.data],
    );
    const accessLabel = isListOwner(access) ? "owner" : "member";
    res.json({ shared_list: rows[0], access: accessLabel, role: access?.role });
  });

  r.patch("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const parsed = patchList.safeParse(req.body);
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
    const access = await getListAccess(pool, idParse.data, userId);
    if (!isListOwner(access)) {
      res.status(403).json({ error: "Solo el dueño puede editar la lista" });
      return;
    }
    const setParts: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const k of keys) {
      setParts.push(`${k} = $${i++}`);
      values.push(body[k]);
    }
    setParts.push(`updated_at = now()`);
    values.push(idParse.data);
    const sql = `UPDATE shared_lists SET ${setParts.join(", ")} WHERE id = $${i} RETURNING id, owner_id, name, description, created_at, updated_at`;
    const { rows } = await pool.query<SharedListRow>(sql, values);
    res.json({ shared_list: rows[0] });
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const access = await getListAccess(pool, idParse.data, userId);
    if (!isListOwner(access)) {
      res.status(403).json({ error: "Solo el dueño puede eliminar la lista" });
      return;
    }
    await pool.query(`DELETE FROM memberships WHERE list_id = $1`, [idParse.data]);
    const { rowCount } = await pool.query(`DELETE FROM shared_lists WHERE id = $1`, [idParse.data]);
    if (!rowCount) {
      res.status(404).json({ error: "Lista no encontrada" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
