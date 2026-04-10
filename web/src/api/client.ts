const API_ROOT = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
/** En desarrollo vacío → proxy Vite `/api`. En producción: `VITE_API_URL=https://tu-api.com` */
export const API_BASE = `${API_ROOT}/api/v1`;

export type ApiErrorBody = {
  error?: string | Record<string, unknown>;
  detail?: string;
  request_id?: string;
  duplicate?: { id: string; date: string };
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Fallo de red o sin respuesta HTTP (sirve para modo offline y cola de envío). */
export class NetworkFailure extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "NetworkFailure";
  }
}

function appendDetail(msg: string, data: ApiErrorBody): string {
  const d = data.detail;
  if (typeof d === "string" && d.trim() && d !== msg) {
    return `${msg} — ${d}`;
  }
  return msg;
}

function appendRequestId(msg: string, data: ApiErrorBody): string {
  const id = data.request_id;
  if (typeof id === "string" && id.trim()) {
    return `${msg} (ref: ${id})`;
  }
  return msg;
}

type ZodFlattenShape = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

function isZodFlatten(v: object): v is ZodFlattenShape {
  return (
    "formErrors" in v &&
    "fieldErrors" in v &&
    Array.isArray((v as ZodFlattenShape).formErrors) &&
    typeof (v as ZodFlattenShape).fieldErrors === "object" &&
    (v as ZodFlattenShape).fieldErrors !== null
  );
}

function formatZodFlatten(f: ZodFlattenShape): string {
  const parts: string[] = [];
  for (const msg of f.formErrors ?? []) {
    if (msg) parts.push(msg);
  }
  const fe = f.fieldErrors ?? {};
  for (const [, msgs] of Object.entries(fe)) {
    for (const msg of msgs) {
      if (msg) parts.push(msg);
    }
  }
  return parts.length > 0 ? parts.join(" ") : "Datos inválidos";
}

function parseError(data: ApiErrorBody | null | undefined, status: number, statusText: string): string {
  const d = data !== null && typeof data === "object" ? data : {};
  const e = d.error;
  if (typeof e === "string" && e.trim()) {
    return appendRequestId(appendDetail(e.trim(), d), d);
  }
  if (e && typeof e === "object") {
    if (isZodFlatten(e)) return appendRequestId(appendDetail(formatZodFlatten(e), d), d);
    return appendRequestId(appendDetail(JSON.stringify(e), d), d);
  }
  if (typeof d.detail === "string" && d.detail.trim()) {
    return appendRequestId(d.detail.trim(), d);
  }
  /* Algunos proxies devuelven { message: "..." } */
  const rawMsg = (d as { message?: string }).message;
  if (typeof rawMsg === "string" && rawMsg.trim() && rawMsg !== "Internal Server Error") {
    return appendRequestId(rawMsg.trim(), d);
  }
  if (status === 502 || status === 503 || status === 504) {
    return appendRequestId(
      "No hubo respuesta del servidor. En desarrollo levantá la API en el puerto 3000 (npm run dev en la raíz del proyecto).",
      d,
    );
  }
  if (status >= 500) {
    const hint =
      " Revisá PostgreSQL y las migraciones (npm run db:migrate). Diagnóstico: en el navegador abrí /health/db en la misma URL del sitio.";
    const fallback = statusText
      ? `Error del servidor (${status}: ${statusText}).${hint}`
      : `Error del servidor (${status}).${hint}`;
    return appendRequestId(fallback, d);
  }
  if (status > 0) {
    const fallback = statusText ? `Error ${status}: ${statusText}` : `Error ${status}`;
    return appendRequestId(fallback, d);
  }
  return appendRequestId("No se pudo completar la solicitud.", d);
}

export async function apiFetch<T>(
  path: string,
  token: string | null,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers: h, ...rest } = init;
  const headers = new Headers(h);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    rest.body = JSON.stringify(json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch (cause) {
    throw new NetworkFailure(
      "No se pudo conectar con el servidor. Comprobá tu conexión y que la API esté en marcha (desarrollo: puerto 3000).",
      cause,
    );
  }
  const text = await res.text();
  let data: (T & ApiErrorBody) | null = null;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as T & ApiErrorBody;
      }
    } catch {
      if (!res.ok) {
        throw new Error(
          text.length > 80
            ? `Respuesta no JSON (${res.status}). ¿La API está en marcha y es esta URL?`
            : parseError(null, res.status, res.statusText),
        );
      }
    }
  }
  if (!res.ok) {
    throw new ApiError(parseError(data, res.status, res.statusText), res.status, data);
  }
  return (data ?? {}) as T;
}

export async function loginRequest(email: string, password: string) {
  return apiFetch<{ user: { id: string; email: string }; access_token: string }>(
    "/auth/login",
    null,
    { method: "POST", json: { email, password } },
  );
}

export async function registerRequest(
  email: string,
  password: string,
  first_name?: string,
  last_name?: string,
) {
  return apiFetch<{ user: { id: string; email: string }; access_token: string }>(
    "/auth/register",
    null,
    { method: "POST", json: { email, password, first_name, last_name } },
  );
}

export type PublicUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  currency: string;
  timezone: string | null;
  language: string | null;
  dark_mode: boolean;
  created_at: string;
  updated_at: string;
};

export async function meRequest(token: string) {
  return apiFetch<{ user: PublicUser }>("/users/me", token);
}

export async function patchMe(token: string, body: { dark_mode?: boolean; first_name?: string | null; last_name?: string | null }) {
  return apiFetch<{ user: PublicUser }>("/users/me", token, { method: "PATCH", json: body });
}

export type Expense = {
  id: string;
  user_id: string;
  amount: string;
  currency: string;
  category: string | null;
  description: string | null;
  date: string;
  is_income: boolean;
  shared_list_id: string | null;
  due_date: string | null;
  receipt_url: string | null;
  created_at: string;
  /** Solo UI: movimiento en cola offline, aún no confirmado en el servidor */
  pending_sync?: boolean;
};

export type ExpenseListQuery = {
  from?: string;
  to?: string;
  category?: string;
  is_income?: boolean;
  shared_list_id?: string;
  personal_only?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

function expenseQueryString(q: ExpenseListQuery): string {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.category) p.set("category", q.category);
  if (q.is_income !== undefined) p.set("is_income", q.is_income ? "true" : "false");
  if (q.shared_list_id) p.set("shared_list_id", q.shared_list_id);
  if (q.personal_only) p.set("personal_only", "true");
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.limit != null) p.set("limit", String(q.limit));
  if (q.offset != null) p.set("offset", String(q.offset));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function listExpenses(token: string, query: ExpenseListQuery = {}) {
  return apiFetch<{ expenses: Expense[]; limit: number; offset: number }>(
    `/expenses${expenseQueryString(query)}`,
    token,
  );
}

export async function exportExpensesCsv(token: string, query: Omit<ExpenseListQuery, "limit" | "offset"> = {}) {
  const p = new URLSearchParams();
  if (query.from) p.set("from", query.from);
  if (query.to) p.set("to", query.to);
  if (query.category) p.set("category", query.category);
  if (query.is_income !== undefined) p.set("is_income", query.is_income ? "true" : "false");
  if (query.shared_list_id) p.set("shared_list_id", query.shared_list_id);
  if (query.personal_only) p.set("personal_only", "true");
  if (query.q?.trim()) p.set("q", query.q.trim());
  const qs = p.toString();
  const path = `/expenses/export/csv${qs ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (cause) {
    throw new NetworkFailure(
      "No se pudo conectar con el servidor para exportar el CSV. Comprobá tu conexión.",
      cause,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    let data = {} as ApiErrorBody;
    try {
      if (text) data = JSON.parse(text) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    throw new ApiError(parseError(data, res.status, res.statusText), res.status, data);
  }
  return res.blob();
}

export async function deleteExpense(token: string, id: string) {
  await apiFetch<Record<string, never>>(`/expenses/${id}`, token, { method: "DELETE" });
}

export async function updateExpense(
  token: string,
  id: string,
  body: Partial<{
    amount: number;
    currency: string;
    date: string;
    category: string | null;
    description: string | null;
    is_income: boolean;
    shared_list_id: string | null;
    due_date: string | null;
    receipt_url: string | null;
  }>,
) {
  return apiFetch<{ expense: Expense }>(`/expenses/${id}`, token, { method: "PATCH", json: body });
}

export async function createExpense(
  token: string,
  body: {
    amount: number;
    currency: string;
    date: string;
    category?: string | null;
    description?: string | null;
    is_income?: boolean;
    shared_list_id?: string | null;
    due_date?: string | null;
    receipt_url?: string | null;
    force_duplicate?: boolean;
  },
) {
  return apiFetch<{ expense: Expense }>("/expenses", token, { method: "POST", json: body });
}

export type SharedList = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSharedLists(token: string) {
  return apiFetch<{ shared_lists: SharedList[] }>("/shared-lists", token);
}

export async function getSharedList(token: string, id: string) {
  return apiFetch<{ shared_list: SharedList; access: string; role: string | undefined }>(
    `/shared-lists/${id}`,
    token,
  );
}

export async function createSharedList(token: string, body: { name: string; description?: string | null }) {
  return apiFetch<{ shared_list: SharedList }>("/shared-lists", token, { method: "POST", json: body });
}

export async function updateSharedList(
  token: string,
  id: string,
  body: { name?: string; description?: string | null },
) {
  return apiFetch<{ shared_list: SharedList }>(`/shared-lists/${id}`, token, { method: "PATCH", json: body });
}

export async function deleteSharedList(token: string, id: string) {
  await apiFetch<unknown>(`/shared-lists/${id}`, token, { method: "DELETE" });
}

export type Member = {
  id: string;
  user_id: string;
  list_id: string;
  role: string;
  joined_at: string;
  email: string;
};

export async function listMembers(token: string, listId: string) {
  return apiFetch<{ members: Member[] }>(`/shared-lists/${listId}/members`, token);
}

export type ListActivityItem = {
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
};

export async function listSharedListActivity(token: string, listId: string) {
  return apiFetch<{ activity: ListActivityItem[] }>(`/shared-lists/${listId}/activity`, token);
}

export async function addMember(token: string, listId: string, email: string, role?: "editor" | "viewer") {
  return apiFetch<{ member: Member; email: string }>(`/shared-lists/${listId}/members`, token, {
    method: "POST",
    json: role ? { email, role } : { email },
  });
}

export async function updateMemberRole(
  token: string,
  listId: string,
  memberUserId: string,
  role: "editor" | "viewer",
) {
  return apiFetch<{ member: Member }>(`/shared-lists/${listId}/members/${memberUserId}`, token, {
    method: "PATCH",
    json: { role },
  });
}

export async function removeMember(token: string, listId: string, memberUserId: string) {
  await apiFetch<unknown>(`/shared-lists/${listId}/members/${memberUserId}`, token, { method: "DELETE" });
}

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(token: string, unreadOnly?: boolean) {
  const q = unreadOnly ? "?unread_only=true" : "";
  return apiFetch<{ notifications: Notification[]; unread_count: number }>(`/notifications${q}`, token);
}

export async function markNotificationRead(token: string, id: string) {
  return apiFetch<{ notification: Notification }>(`/notifications/${id}/read`, token, { method: "PATCH" });
}

export async function markAllNotificationsRead(token: string) {
  await apiFetch<unknown>("/notifications/read-all", token, { method: "POST" });
}

export type Budget = {
  id: string;
  user_id: string;
  category: string;
  limit_amount: string;
  period: string;
  alert_threshold: number | null;
  created_at: string;
  updated_at: string;
};

export type BudgetUsage = {
  budget_id: string;
  category: string;
  period: string;
  range: { start: string; end: string };
  limit_amount: string;
  spent: string;
  remaining: string;
  percent_used: number;
  alert_threshold: number | null;
  over_limit: boolean;
};

export async function listBudgets(token: string) {
  return apiFetch<{ budgets: Budget[] }>("/budgets", token);
}

export async function createBudget(
  token: string,
  body: {
    category: string;
    limit_amount: number;
    period: string;
    alert_threshold?: number | null;
  },
) {
  return apiFetch<{ budget: Budget }>("/budgets", token, { method: "POST", json: body });
}

export async function updateBudget(
  token: string,
  id: string,
  body: Partial<{ category: string; limit_amount: number; period: string; alert_threshold: number | null }>,
) {
  return apiFetch<{ budget: Budget }>(`/budgets/${id}`, token, { method: "PATCH", json: body });
}

export async function deleteBudget(token: string, id: string) {
  await apiFetch<unknown>(`/budgets/${id}`, token, { method: "DELETE" });
}

export async function getBudgetUsage(token: string, id: string) {
  return apiFetch<BudgetUsage>(`/budgets/${id}/usage`, token);
}

export type SavingsGoal = {
  id: string;
  user_id: string;
  name: string;
  target_amount: string;
  saved_amount: string;
  currency: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSavingsGoals(token: string) {
  return apiFetch<{ goals: SavingsGoal[] }>("/savings-goals", token);
}

export async function createSavingsGoal(
  token: string,
  body: { name: string; target_amount: number; saved_amount?: number; currency?: string; deadline?: string | null },
) {
  return apiFetch<{ goal: SavingsGoal }>("/savings-goals", token, { method: "POST", json: body });
}

export async function updateSavingsGoal(
  token: string,
  id: string,
  body: Partial<{ name: string; target_amount: number; saved_amount: number; currency: string; deadline: string | null }>,
) {
  return apiFetch<{ goal: SavingsGoal }>(`/savings-goals/${id}`, token, { method: "PATCH", json: body });
}

export async function deleteSavingsGoal(token: string, id: string) {
  await apiFetch<unknown>(`/savings-goals/${id}`, token, { method: "DELETE" });
}

export type CategoryRule = {
  id: string;
  user_id: string;
  pattern: string;
  category: string;
  created_at: string;
};

export async function listCategoryRules(token: string) {
  return apiFetch<{ rules: CategoryRule[] }>("/category-rules", token);
}

export async function createCategoryRule(token: string, body: { pattern: string; category: string }) {
  return apiFetch<{ rule: CategoryRule }>("/category-rules", token, { method: "POST", json: body });
}

export async function deleteCategoryRule(token: string, id: string) {
  await apiFetch<unknown>(`/category-rules/${id}`, token, { method: "DELETE" });
}

export async function getWebhook(token: string) {
  return apiFetch<{ webhook: { url: string; updated_at?: string } | null }>("/webhooks", token);
}

export async function putWebhook(token: string, url: string) {
  return apiFetch<{ webhook: { url: string; updated_at: string } }>("/webhooks", token, { method: "PUT", json: { url } });
}

export async function deleteWebhook(token: string) {
  await apiFetch<unknown>("/webhooks", token, { method: "DELETE" });
}

export type AuditLogEntry = {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  entity_id: string;
  action: string;
  summary: string;
  changes: unknown;
  created_at: string;
};

export async function listAuditLog(token: string, opts?: { limit?: number; offset?: number }) {
  const p = new URLSearchParams();
  if (opts?.limit != null) p.set("limit", String(opts.limit));
  if (opts?.offset != null) p.set("offset", String(opts.offset));
  const qs = p.toString();
  return apiFetch<{ entries: AuditLogEntry[] }>(`/audit${qs ? `?${qs}` : ""}`, token);
}

export type BackupPayload = {
  backup_version: number;
  exported_at: string;
  user: PublicUser;
  expenses: unknown[];
  budgets: unknown[];
  savings_goals: unknown[];
  shared_lists: unknown[];
  category_rules: unknown[];
  webhook: { url: string; created_at?: string; updated_at?: string } | null;
  memberships: unknown[];
};

export async function fetchBackupJson(token: string) {
  return apiFetch<BackupPayload>("/users/me/backup", token);
}

export type ImportBackupSummary = {
  shared_lists_upserted: number;
  memberships_inserted: number;
  budgets_upserted: number;
  savings_goals_upserted: number;
  category_rules_upserted: number;
  webhook_updated: boolean;
  expenses_inserted: number;
  expenses_updated: number;
  expenses_skipped: number;
};

export async function importBackup(
  token: string,
  body: {
    data: BackupPayload;
    on_conflict?: "skip" | "overwrite";
    replace_category_rules?: boolean;
  },
) {
  return apiFetch<{ ok: true; summary: ImportBackupSummary }>("/users/me/backup/import", token, {
    method: "POST",
    json: {
      data: body.data,
      on_conflict: body.on_conflict ?? "skip",
      replace_category_rules: body.replace_category_rules ?? false,
    },
  });
}
