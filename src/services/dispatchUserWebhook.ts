import type { Pool } from "pg";

type ExpensePayload = {
  id: string;
  amount: string;
  currency: string;
  category: string | null;
  description: string | null;
  date: string;
  is_income: boolean;
  shared_list_id: string | null;
};

export async function dispatchUserWebhook(
  pool: Pool,
  userId: string,
  event: "expense.created",
  expense: ExpensePayload,
): Promise<void> {
  const { rows } = await pool.query<{ url: string }>(
    `SELECT url FROM user_webhooks WHERE user_id = $1`,
    [userId],
  );
  const url = rows[0]?.url;
  if (!url) return;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, expense }),
      signal: controller.signal,
    });
  } catch {
    /* no bloquear el flujo principal */
  } finally {
    clearTimeout(t);
  }
}
