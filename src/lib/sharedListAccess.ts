import type { Pool } from "pg";

export type ListAccess = { role: "owner" | "editor" | "viewer" } | null;

export async function getListAccess(pool: Pool, listId: string, userId: string): Promise<ListAccess> {
  const { rows } = await pool.query<{ owner_id: string }>(
    `SELECT owner_id FROM shared_lists WHERE id = $1`,
    [listId],
  );
  const list = rows[0];
  if (!list) return null;
  if (list.owner_id === userId) return { role: "owner" };
  const m = await pool.query<{ role: string }>(
    `SELECT role FROM memberships WHERE list_id = $1 AND user_id = $2`,
    [listId, userId],
  );
  const r = m.rows[0]?.role;
  if (r === "editor" || r === "viewer") return { role: r };
  return null;
}

export function isListOwner(access: ListAccess): boolean {
  return access?.role === "owner";
}

export function isListParticipant(access: ListAccess): boolean {
  return access !== null;
}

export function canCreateExpenseOnList(access: ListAccess): boolean {
  if (!access) return false;
  return access.role === "owner" || access.role === "editor";
}

export async function canMutateExpense(
  pool: Pool,
  userId: string,
  exp: { user_id: string; shared_list_id: string | null },
): Promise<boolean> {
  if (exp.user_id === userId) return true;
  if (!exp.shared_list_id) return false;
  const access = await getListAccess(pool, exp.shared_list_id, userId);
  return isListOwner(access);
}
