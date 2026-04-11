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

  r.get("/:id/activity", auth, async (req, res) => {
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
    const { rows } = await pool.query<{
      id: string;
      amount: string;
      currency: string;
      category: string | null;
      description: string | null;
      date: string;
      is_income: boolean;
      created_at: string;
      user_id: string;
      email: string;
    }>(
      `SELECT e.id, e.amount::text, e.currency, e.category, e.description, e.date, e.is_income, e.created_at,
              e.user_id, u.email
       FROM expenses e
       JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL
       WHERE e.shared_list_id = $1 AND e.deleted_at IS NULL
       ORDER BY e.created_at DESC
       LIMIT 50`,
      [idParse.data],
    );
    res.json({ activity: rows });
  });

  /** Reparto equitativo de gastos de la lista (solo gastos, no ingresos): quién pagó de más y sugerencias de transferencias. */
  r.get("/:id/split-expenses", auth, async (req, res) => {
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
    const { rows: memberRows } = await pool.query<{ user_id: string; email: string }>(
      `SELECT sl.owner_id AS user_id, u.email FROM shared_lists sl JOIN users u ON u.id = sl.owner_id AND u.deleted_at IS NULL WHERE sl.id = $1
       UNION
       SELECT m.user_id, u.email FROM memberships m JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL WHERE m.list_id = $1`,
      [idParse.data],
    );
    const memberIds = [...new Set(memberRows.map((m) => m.user_id))];
    const emailByUser = Object.fromEntries(memberRows.map((m) => [m.user_id, m.email]));

    const { rows: expRows } = await pool.query<{ user_id: string; amount: string; currency: string }>(
      `SELECT user_id, amount::text, currency FROM expenses
       WHERE shared_list_id = $1 AND deleted_at IS NULL AND is_income = false`,
      [idParse.data],
    );

    type CurAgg = { total: number; paid: Record<string, number> };
    const byCur = new Map<string, CurAgg>();
    for (const e of expRows) {
      const cur = e.currency || "USD";
      const amt = Number(e.amount);
      if (!byCur.has(cur)) byCur.set(cur, { total: 0, paid: {} });
      const g = byCur.get(cur)!;
      g.total += amt;
      g.paid[e.user_id] = (g.paid[e.user_id] ?? 0) + amt;
    }

    const n = Math.max(1, memberIds.length);
    const currencies: Record<
      string,
      {
        total: string;
        per_person: string;
        paid_by_user: Record<string, string>;
        balance_by_user: Record<string, string>;
        suggestions: { from_user_id: string; to_user_id: string; amount: string; from_email: string; to_email: string }[];
      }
    > = {};

    const settle = (balance: Map<string, number>) => {
      const eps = 0.02;
      const b = new Map(balance);
      const sug: { from_user_id: string; to_user_id: string; amount: string; from_email: string; to_email: string }[] = [];
      for (;;) {
        let debtor: string | null = null;
        let creditor: string | null = null;
        let bestD = 0;
        let bestC = 0;
        for (const [uid, v] of b) {
          if (v < bestD - eps) {
            bestD = v;
            debtor = uid;
          }
        }
        for (const [uid, v] of b) {
          if (v > bestC + eps) {
            bestC = v;
            creditor = uid;
          }
        }
        if (!debtor || !creditor) break;
        const dv = b.get(debtor)!;
        const cv = b.get(creditor)!;
        const pay = Math.min(-dv, cv);
        if (pay < eps) break;
        sug.push({
          from_user_id: debtor,
          to_user_id: creditor,
          amount: pay.toFixed(2),
          from_email: emailByUser[debtor] ?? debtor,
          to_email: emailByUser[creditor] ?? creditor,
        });
        b.set(debtor, dv + pay);
        b.set(creditor, cv - pay);
      }
      return sug;
    };

    for (const [cur, agg] of byCur.entries()) {
      const per = agg.total / n;
      const paidBy: Record<string, string> = {};
      const bal: Record<string, string> = {};
      const balMap = new Map<string, number>();
      for (const mid of memberIds) {
        const p = agg.paid[mid] ?? 0;
        paidBy[mid] = p.toFixed(2);
        const b = p - per;
        bal[mid] = b.toFixed(2);
        balMap.set(mid, b);
      }
      currencies[cur] = {
        total: agg.total.toFixed(2),
        per_person: per.toFixed(2),
        paid_by_user: paidBy,
        balance_by_user: bal,
        suggestions: settle(balMap),
      };
    }

    res.json({
      list_id: idParse.data,
      member_count: n,
      members: memberIds.map((id) => ({ user_id: id, email: emailByUser[id] ?? id })),
      currencies,
      note: "Cada gasto se atribuye a quien lo cargó. El reparto asume partes iguales entre todos los miembros.",
    });
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
