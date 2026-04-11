import type { Pool } from "pg";

export type ReminderRow = {
  id: string;
  user_id: string;
  shared_list_id: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  repeat_kind: string;
  reminder_kind: string;
  last_notified_at: string | null;
};

function addInterval(from: Date, kind: string): Date {
  const d = new Date(from.getTime());
  if (kind === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (kind === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (kind === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

async function listParticipantUserIds(pool: Pool, listId: string): Promise<string[]> {
  const { rows } = await pool.query<{ uid: string }>(
    `SELECT owner_id AS uid FROM shared_lists WHERE id = $1
     UNION
     SELECT user_id AS uid FROM memberships WHERE list_id = $1`,
    [listId],
  );
  return [...new Set(rows.map((r) => r.uid))];
}

/**
 * Notifica recordatorios vencidos (una vez por ocurrencia). Los repetitivos avanzan remind_at.
 */
export async function processDueReminders(pool: Pool, userId: string): Promise<void> {
  const { rows } = await pool.query<ReminderRow>(
    `SELECT r.id, r.user_id, r.shared_list_id, r.title, r.body, r.remind_at::text, r.repeat_kind, r.reminder_kind, r.last_notified_at::text
     FROM user_reminders r
     WHERE r.completed_at IS NULL
       AND r.remind_at <= now()
       AND r.last_notified_at IS NULL
       AND (
         r.user_id = $1
         OR (
           r.shared_list_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM shared_lists sl
             LEFT JOIN memberships m ON m.list_id = sl.id AND m.user_id = $1
             WHERE sl.id = r.shared_list_id AND (sl.owner_id = $1 OR m.user_id IS NOT NULL)
           )
         )
       )`,
    [userId],
  );

  for (const r of rows) {
    const recipientIds =
      r.shared_list_id != null
        ? await listParticipantUserIds(pool, r.shared_list_id)
        : [r.user_id];

    const title =
      r.reminder_kind === "expiration"
        ? `Vence: ${r.title}`
        : r.reminder_kind === "agenda"
          ? `Evento: ${r.title}`
          : r.reminder_kind === "routine"
            ? `Rutina: ${r.title}`
            : `Recordatorio: ${r.title}`;
    const body = r.body?.trim() ? r.body.trim() : "Tocá Avisos o abrí Día a día para ver el detalle.";

    for (const uid of recipientIds) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, payload)
         VALUES ($1, 'reminder_due', $2, $3, $4::jsonb)`,
        [uid, title, body, JSON.stringify({ reminder_id: r.id, shared_list_id: r.shared_list_id })],
      );
    }

    if (r.repeat_kind === "none") {
      await pool.query(`UPDATE user_reminders SET last_notified_at = now(), updated_at = now() WHERE id = $1`, [r.id]);
    } else {
      const cur = new Date(r.remind_at);
      let next = addInterval(cur, r.repeat_kind);
      const nowMs = Date.now();
      while (next.getTime() <= nowMs) {
        next = addInterval(next, r.repeat_kind);
      }
      await pool.query(
        `UPDATE user_reminders SET remind_at = $2, last_notified_at = NULL, updated_at = now() WHERE id = $1`,
        [r.id, next.toISOString()],
      );
    }
  }
}
