import type { Expense, ExpenseListQuery, SharedList } from "../api/client";

const DB_NAME = "macahumisa-offline-v1";
const DB_VERSION = 1;

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

export type PendingExpenseCreate = {
  localId: string;
  userId: string;
  body: PendingExpenseBody;
  queuedAt: string;
};

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

export async function enqueuePendingExpense(item: PendingExpenseCreate): Promise<void> {
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

export async function listPendingCreates(userId: string): Promise<PendingExpenseCreate[]> {
  const db = await openDb();
  try {
    const all = await new Promise<PendingExpenseCreate[]>((resolve, reject) => {
      const tx = db.transaction("queue", "readonly");
      const r = tx.objectStore("queue").getAll();
      r.onsuccess = () => resolve((r.result as PendingExpenseCreate[]) ?? []);
      r.onerror = () => reject(r.error);
    });
    return all.filter((x) => x.userId === userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
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

export function pendingCreateToExpense(p: PendingExpenseCreate): Expense {
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
