import type { Pool } from "pg";

export type ExpenseNotifyPayload = {
  id: string;
  amount: string;
  currency: string;
  category: string | null;
  shared_list_id: string;
};

/**
 * Aviso en DB a dueño y miembros de la lista (excepto quien cargó el gasto).
 * Si existen SENDGRID_API_KEY y SENDGRID_FROM_EMAIL, envía email (no bloquea el request si falla).
 */
export async function notifySharedExpenseCreated(
  pool: Pool,
  opts: {
    expense: ExpenseNotifyPayload;
    actorUserId: string;
  },
): Promise<void> {
  const { expense, actorUserId } = opts;
  const listId = expense.shared_list_id;

  const { rows: lists } = await pool.query<{ name: string }>(
    `SELECT name FROM shared_lists WHERE id = $1`,
    [listId],
  );
  const listName = lists[0]?.name ?? "Lista";

  const { rows: recipients } = await pool.query<{ id: string; email: string; first_name: string | null }>(
    `SELECT DISTINCT u.id, u.email, u.first_name
     FROM (
       SELECT owner_id AS uid FROM shared_lists WHERE id = $1
       UNION
       SELECT user_id AS uid FROM memberships WHERE list_id = $1
     ) p
     JOIN users u ON u.id = p.uid AND u.deleted_at IS NULL
     WHERE p.uid <> $2`,
    [listId, actorUserId],
  );

  if (recipients.length === 0) return;

  const { rows: actors } = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [actorUserId],
  );
  const actorEmail = actors[0]?.email ?? "Alguien";

  const title = `Nuevo gasto en «${listName}»`;
  const amountLine = `${expense.amount} ${expense.currency}`;
  const body = `${actorEmail} agregó ${amountLine}${expense.category ? ` · ${expense.category}` : ""}.`;
  const payload = {
    expense_id: expense.id,
    shared_list_id: listId,
    actor_user_id: actorUserId,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
  };

  for (const r of recipients) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, payload)
       VALUES ($1, 'expense_shared', $2, $3, $4::jsonb)`,
      [r.id, title, body, JSON.stringify(payload)],
    );
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !from) return;

  try {
    const sg = await import("@sendgrid/mail");
    sg.default.setApiKey(apiKey);
    await Promise.all(
      recipients.map((r) =>
        sg.default
          .send({
            to: r.email,
            from,
            subject: title,
            text: `${body}\n\n— Macahumisa`,
          })
          .catch((err: unknown) => {
            console.error("SendGrid error para", r.email, err);
          }),
      ),
    );
  } catch (e) {
    console.error("SendGrid no disponible:", e);
  }
}
