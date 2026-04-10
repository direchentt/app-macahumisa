import type { Pool } from "pg";

/** Fila de gasto para auditoría (campos usados en diff y snapshot). */
export type ExpenseAuditRow = {
  id: string;
  amount: string;
  currency: string;
  category: string | null;
  description: string | null;
  date: string;
  is_income: boolean;
  shared_list_id: string | null;
  due_date: string | null;
  receipt_url: string | null;
};

function receiptAuditTag(url: string | null): "none" | "url" | "inline" {
  if (!url) return "none";
  if (url.startsWith("data:")) return "inline";
  return "url";
}

export function expenseSnapshotForAudit(row: ExpenseAuditRow): Record<string, unknown> {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    description: row.description,
    date: row.date,
    is_income: row.is_income,
    shared_list_id: row.shared_list_id,
    due_date: row.due_date,
    receipt: receiptAuditTag(row.receipt_url),
  };
}

const PATCH_KEYS = [
  "amount",
  "currency",
  "category",
  "description",
  "date",
  "is_income",
  "shared_list_id",
  "due_date",
  "receipt_url",
] as const;

type PatchKey = (typeof PATCH_KEYS)[number];

function normalizeForCompare(key: PatchKey, v: unknown): unknown {
  if (key === "receipt_url") {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.startsWith("data:")) return "inline_image";
    return v;
  }
  return v;
}

export function expenseUpdateDiff(
  before: ExpenseAuditRow,
  after: ExpenseAuditRow,
  patchedKeys: string[],
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of patchedKeys) {
    if (!PATCH_KEYS.includes(key as PatchKey)) continue;
    const k = key as PatchKey;
    let b: unknown;
    let a: unknown;
    if (k === "amount") {
      b = before.amount;
      a = after.amount;
    } else if (k === "currency") {
      b = before.currency;
      a = after.currency;
    } else if (k === "category") {
      b = before.category;
      a = after.category;
    } else if (k === "description") {
      b = before.description;
      a = after.description;
    } else if (k === "date") {
      b = before.date;
      a = after.date;
    } else if (k === "is_income") {
      b = before.is_income;
      a = after.is_income;
    } else if (k === "shared_list_id") {
      b = before.shared_list_id;
      a = after.shared_list_id;
    } else if (k === "due_date") {
      b = before.due_date;
      a = after.due_date;
    } else if (k === "receipt_url") {
      b = normalizeForCompare("receipt_url", before.receipt_url);
      a = normalizeForCompare("receipt_url", after.receipt_url);
    }
    const nb = normalizeForCompare(k, b);
    const na = normalizeForCompare(k, a);
    if (JSON.stringify(nb) !== JSON.stringify(na)) {
      diff[k] = { from: nb, to: na };
    }
  }
  return diff;
}

export function summarizeExpenseCreate(row: ExpenseAuditRow): string {
  const sign = row.is_income ? "Ingreso" : "Gasto";
  return `${sign} creado · ${row.amount} ${row.currency}${row.category ? ` · ${row.category}` : ""}`;
}

export function summarizeExpenseUpdate(diff: Record<string, { from: unknown; to: unknown }>): string {
  const keys = Object.keys(diff);
  if (keys.length === 0) return "Gasto actualizado (sin cambios detectados)";
  const preview = keys.slice(0, 4).join(", ");
  return keys.length > 4 ? `Gasto editado: ${preview}…` : `Gasto editado: ${preview}`;
}

export function summarizeExpenseDelete(row: ExpenseAuditRow): string {
  const sign = row.is_income ? "Ingreso" : "Gasto";
  return `${sign} eliminado · ${row.amount} ${row.currency}`;
}

export async function insertExpenseAudit(
  pool: Pool,
  params: {
    actorUserId: string;
    entityId: string;
    action: "create" | "update" | "delete";
    summary: string;
    changes: Record<string, unknown>;
    requestId?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor_user_id, entity_type, entity_id, action, summary, changes, request_id)
     VALUES ($1, 'expense', $2, $3, $4, $5::jsonb, $6)`,
    [
      params.actorUserId,
      params.entityId,
      params.action,
      params.summary,
      JSON.stringify(params.changes),
      params.requestId?.slice(0, 128) ?? null,
    ],
  );
}

/** No debe fallar la petición principal si el log falla. */
export function logExpenseAuditSafe(
  pool: Pool,
  params: {
    actorUserId: string;
    entityId: string;
    action: "create" | "update" | "delete";
    summary: string;
    changes: Record<string, unknown>;
    requestId?: string | null;
  },
): void {
  void insertExpenseAudit(pool, params).catch((err) => console.error("insertExpenseAudit", err));
}
