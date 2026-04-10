const API = "/api/v1";

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
  const res = await fetch(`${API}${path}`, { ...rest, headers });
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
  category: string;
  limit_amount: string;
  period: string;
  alert_threshold: number | null;
};

export async function listBudgets(token: string) {
  return apiFetch<{ budgets: Budget[] }>("/budgets", token);
}
