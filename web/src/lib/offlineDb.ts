import type { Expense, ExpenseListQuery, SharedList } from "../api/client";

const DB_NAME = "macahumisa-offline-v1";
const DB_VERSION = 2;

export type DashboardCacheRow = {
  userId: string;
  queryKey: string;
  expenses: Expense[];
  lists: SharedList[];
  savedAt: string;
};

export type PendingExpenseBody = {
  amount: number;
  currency: string;
  date: string;
  category?: string | null;
  description?: string | null;
  is_income?: boolean;
  shared_list_id?: string | null;
  due_date?: string | null;
  receipt_url?: string | null;
};

/** Cuerpo de PATCH alineado con updateExpense en el cliente. */
export type PendingUpdateBody = {
  amount: number;
  currency: string;
  date: string;
  category: string | null;
  description: string | null;
  is_income: boolean;
  shared_list_id: string | null;
  due_date: string | null;
  receipt_url: string | null;
};

export type QueuedCreate = {
  op: "create";
  localId: string;
  userId: string;
  body: PendingExpenseBody;
  queuedAt: string;
};

export type QueuedUpdate = {
  op: "update";
  localId: string;
  userId: string;
  expenseId: string;
  body: PendingUpdateBody;
  queuedAt: string;
};

export type QueuedDelete = {
  op: "delete";
  localId: string;
  userId: string;
  expenseId: string;
  queuedAt: string;
};

export type QueuedItem = QueuedCreate | QueuedUpdate | QueuedDelete;

function isQueuedItem(raw: unknown): raw is QueuedItem {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.op === "create" || o.op === "update" || o.op === "delete") return true;
  /* Migración: colas viejas solo tenían create */
  return Boolean(o.localId && o.userId && o.body && typeof o.body === "object");
}

function normalizeQueued(raw: unknown): QueuedItem | null {
  if (!isQueuedItem(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.op === "update" || o.op === "delete") return raw as QueuedUpdate | QueuedDelete;
  if (o.op === "create") return raw as QueuedCreate;
  return {
    op: "create",
    localId: String(o.localId),
    userId: String(o.userId),
    body: o.body as PendingExpenseBody,
    queuedAt: String(o.queuedAt ?? new Date().toISOString()),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("dashboard")) {
        db.createObjectStore("dashboard", { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "localId" });
      }
    };
  });
}

export function expenseQueryKey(q: ExpenseListQuery): string {
  return JSON.stringify({
    from: q.from ?? null,
    to: q.to ?? null,
    category: q.category ?? null,
    is_income: q.is_income ?? null,
    shared_list_id: q.shared_list_id ?? null,
    personal_only: q.personal_only ?? null,
    q: q.q ?? null,
    limit: q.limit ?? null,
    offset: q.offset ?? null,
  });
}

export async function saveDashboardCache(row: DashboardCacheRow): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("dashboard", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("dashboard").put(row);
    });
  } finally {
    db.close();
  }
}

export async function loadDashboardCache(userId: string): Promise<DashboardCacheRow | null> {
  const db = await openDb();
  try {
    const row = await new Promise<DashboardCacheRow | undefined>((resolve, reject) => {
      const tx = db.transaction("dashboard", "readonly");
      const r = tx.objectStore("dashboard").get(userId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function enqueueQueued(item: QueuedItem): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("queue").put(item);
    });
  } finally {
    db.close();
  }
}

export async function listPendingOps(userId: string): Promise<QueuedItem[]> {
  const db = await openDb();
  try {
    const all = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction("queue", "readonly");
      const r = tx.objectStore("queue").getAll();
      r.onsuccess = () => resolve((r.result as unknown[]) ?? []);
      r.onerror = () => reject(r.error);
    });
    const out: QueuedItem[] = [];
    for (const raw of all) {
      const n = normalizeQueued(raw);
      if (n && n.userId === userId) out.push(n);
    }
    return out.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } finally {
    db.close();
  }
}

export async function removePending(localId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("queue").delete(localId);
    });
  } finally {
    db.close();
  }
}

export function pendingCreateToExpense(p: QueuedCreate): Expense {
  const b = p.body;
  return {
    id: p.localId,
    user_id: p.userId,
    amount: String(b.amount),
    currency: b.currency,
    category: b.category ?? null,
    description: b.description ?? null,
    date: b.date,
    is_income: b.is_income ?? false,
    shared_list_id: b.shared_list_id ?? null,
    due_date: b.due_date ?? null,
    receipt_url: b.receipt_url ?? null,
    created_at: p.queuedAt,
    pending_sync: true,
  };
}

export function mergeExpenseWithPatch(e: Expense, b: PendingUpdateBody): Expense {
  return {
    ...e,
    amount: String(b.amount),
    currency: b.currency,
    date: b.date,
    category: b.category,
    description: b.description,
    is_income: b.is_income,
    shared_list_id: b.shared_list_id,
    due_date: b.due_date,
    receipt_url: b.receipt_url,
    pending_sync: true,
  };
}

export function buildDisplayExpenses(server: Expense[], ops: QueuedItem[]): Expense[] {
  const deletes = new Set(ops.filter((o): o is QueuedDelete => o.op === "delete").map((o) => o.expenseId));
  let merged = server.filter((e) => !deletes.has(e.id));
  for (const o of ops) {
    if (o.op !== "update") continue;
    const i = merged.findIndex((e) => e.id === o.expenseId);
    if (i >= 0) merged[i] = mergeExpenseWithPatch(merged[i]!, o.body);
  }
  const creates = ops.filter((o): o is QueuedCreate => o.op === "create").map(pendingCreateToExpense);
  return [...creates, ...merged].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
