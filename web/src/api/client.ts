const API_ROOT = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
/** En desarrollo vacío → proxy Vite `/api`. En producción: `VITE_API_URL=https://tu-api.com` */
export const API_BASE = `${API_ROOT}/api/v1`;

export type ApiErrorBody = { error?: string | Record<string, unknown> };

function parseError(data: ApiErrorBody): string {
  const e = data.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") return JSON.stringify(e);
  return "Error desconocido";
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
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let data = {} as T & ApiErrorBody;
  if (text) {
    try {
      data = JSON.parse(text) as T & ApiErrorBody;
    } catch {
      if (!res.ok) throw new Error(res.statusText || "Error");
    }
  }
  if (res.status === 401) {
    throw new Error("Sesión vencida o inválida");
  }
  if (!res.ok) {
    throw new Error(parseError(data));
  }
  return data as T;
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

export async function meRequest(token: string) {
  return apiFetch<{ user: { email: string; id: string; first_name: string | null; last_name: string | null } }>(
    "/users/me",
    token,
  );
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
  created_at: string;
};

export async function listExpenses(token: string) {
  return apiFetch<{ expenses: Expense[]; limit: number; offset: number }>("/expenses", token);
}

export async function deleteExpense(token: string, id: string) {
  await apiFetch<Record<string, never>>(`/expenses/${id}`, token, { method: "DELETE" });
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
