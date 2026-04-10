import { z } from "zod";
import type { Pool, PoolClient } from "pg";

const uuid = z.string().uuid();

const backupUserSchema = z
  .object({
    id: uuid,
    email: z.string().email(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    profile_picture_url: z.string().nullable().optional(),
    avatar_slug: z.string().max(32).nullable().optional(),
    currency: z.string().length(3).optional(),
    timezone: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    dark_mode: z.boolean().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

const receiptUrlField = z.union([
  z.string().url(),
  z.string().max(750_000).regex(/^data:image\/jpeg;base64,/),
  z.null(),
]);

const backupExpenseRow = z
  .object({
    id: uuid,
    user_id: uuid,
    amount: z.string(),
    currency: z.string().min(1).max(3),
    category: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    date: z.string(),
    tags: z.array(z.string()).nullable().optional(),
    notes: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    is_income: z.boolean().optional(),
    is_recurring: z.boolean().optional(),
    recurring_frequency: z.string().nullable().optional(),
    merchant: z.string().nullable().optional(),
    receipt_url: receiptUrlField.optional().nullable(),
    status: z.string().nullable().optional(),
    shared_with: z.array(z.string()).nullable().optional(),
    shared_list_id: uuid.nullable().optional(),
    due_date: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough();

const backupBudgetRow = z
  .object({
    id: uuid,
    user_id: uuid,
    limit_amount: z.string(),
    category: z.string(),
    period: z.string(),
    alert_threshold: z.number().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

const backupGoalRow = z
  .object({
    id: uuid,
    user_id: uuid,
    name: z.string(),
    target_amount: z.string(),
    saved_amount: z.string(),
    currency: z.string(),
    deadline: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

const backupListRow = z
  .object({
    id: uuid,
    owner_id: uuid,
    name: z.string(),
    description: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

const backupRuleRow = z
  .object({
    id: uuid,
    user_id: uuid,
    pattern: z.string(),
    category: z.string(),
    created_at: z.string().optional(),
  })
  .passthrough();

const backupMembershipRow = z
  .object({
    id: uuid,
    user_id: uuid,
    list_id: uuid,
    role: z.string(),
    joined_at: z.string().optional(),
  })
  .passthrough();

export const backupPayloadSchema = z.object({
  backup_version: z.literal(1),
  exported_at: z.string().optional(),
  user: backupUserSchema,
  expenses: z.array(backupExpenseRow),
  budgets: z.array(backupBudgetRow),
  savings_goals: z.array(backupGoalRow),
  shared_lists: z.array(backupListRow),
  category_rules: z.array(backupRuleRow),
  webhook: z
    .object({
      url: z.string(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    })
    .nullable()
    .optional(),
  memberships: z.array(backupMembershipRow),
});

export type BackupPayloadParsed = z.infer<typeof backupPayloadSchema>;

export type ImportBackupResult = {
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

async function userCanUseList(c: PoolClient, userId: string, listId: string): Promise<boolean> {
  const { rows } = await c.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM shared_lists sl
       LEFT JOIN memberships m ON m.list_id = sl.id AND m.user_id = $1
       WHERE sl.id = $2 AND (sl.owner_id = $1 OR m.user_id IS NOT NULL)
     ) AS ok`,
    [userId, listId],
  );
  return Boolean(rows[0]?.ok);
}

export async function importUserBackup(
  pool: Pool,
  userId: string,
  raw: unknown,
  opts: { onConflict: "skip" | "overwrite"; replaceCategoryRules: boolean },
): Promise<ImportBackupResult> {
  const { onConflict, replaceCategoryRules } = opts;
  const parsed = backupPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const err = new Error("JSON de respaldo inválido") as Error & { status?: number; zod?: unknown };
    err.status = 400;
    err.zod = parsed.error.flatten();
    throw err;
  }
  const data = parsed.data;
  if (data.user.id !== userId) {
    const err = new Error("El respaldo es de otra cuenta (user.id no coincide con tu sesión).") as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  const result: ImportBackupResult = {
    shared_lists_upserted: 0,
    memberships_inserted: 0,
    budgets_upserted: 0,
    savings_goals_upserted: 0,
    category_rules_upserted: 0,
    webhook_updated: false,
    expenses_inserted: 0,
    expenses_updated: 0,
    expenses_skipped: 0,
  };

  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    for (const sl of data.shared_lists) {
      if (sl.owner_id !== userId) continue;
      await c.query(
        `INSERT INTO shared_lists (id, owner_id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), COALESCE($6::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           updated_at = now()`,
        [sl.id, sl.owner_id, sl.name, sl.description ?? null, sl.created_at ?? null, sl.updated_at ?? null],
      );
      result.shared_lists_upserted += 1;
    }

    for (const m of data.memberships) {
      if (m.user_id !== userId) continue;
      const listOk = await c.query(`SELECT 1 FROM shared_lists WHERE id = $1`, [m.list_id]);
      if (!listOk.rowCount) continue;
      const ins = await c.query(
        `INSERT INTO memberships (id, user_id, list_id, role, joined_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (user_id, list_id) DO NOTHING`,
        [m.id, m.user_id, m.list_id, m.role, m.joined_at ?? null],
      );
      if (ins.rowCount) result.memberships_inserted += 1;
    }

    for (const b of data.budgets) {
      if (b.user_id !== userId) continue;
      const exists = await c.query(`SELECT 1 FROM budgets WHERE id = $1`, [b.id]);
      if (exists.rowCount && onConflict === "skip") continue;
      await c.query(
        `INSERT INTO budgets (id, user_id, category, limit_amount, period, alert_threshold, created_at, updated_at)
         VALUES ($1, $2, $3, $4::numeric, $5, $6, COALESCE($7::timestamptz, now()), COALESCE($8::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET
           category = EXCLUDED.category,
           limit_amount = EXCLUDED.limit_amount,
           period = EXCLUDED.period,
           alert_threshold = EXCLUDED.alert_threshold,
           updated_at = now()`,
        [
          b.id,
          b.user_id,
          b.category,
          b.limit_amount,
          b.period,
          b.alert_threshold ?? null,
          b.created_at ?? null,
          b.updated_at ?? null,
        ],
      );
      result.budgets_upserted += 1;
    }

    for (const g of data.savings_goals) {
      if (g.user_id !== userId) continue;
      const exists = await c.query(`SELECT 1 FROM savings_goals WHERE id = $1`, [g.id]);
      if (exists.rowCount && onConflict === "skip") continue;
      await c.query(
        `INSERT INTO savings_goals (id, user_id, name, target_amount, saved_amount, currency, deadline, created_at, updated_at)
         VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7::date, COALESCE($8::timestamptz, now()), COALESCE($9::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           target_amount = EXCLUDED.target_amount,
           saved_amount = EXCLUDED.saved_amount,
           currency = EXCLUDED.currency,
           deadline = EXCLUDED.deadline,
           updated_at = now()`,
        [
          g.id,
          g.user_id,
          g.name,
          g.target_amount,
          g.saved_amount,
          g.currency,
          g.deadline ? g.deadline.slice(0, 10) : null,
          g.created_at ?? null,
          g.updated_at ?? null,
        ],
      );
      result.savings_goals_upserted += 1;
    }

    const rulesMine = data.category_rules.filter((r) => r.user_id === userId);
    if (replaceCategoryRules && rulesMine.length > 0) {
      await c.query(`DELETE FROM category_rules WHERE user_id = $1`, [userId]);
      const seenPat = new Set<string>();
      for (const r of rulesMine) {
        const k = r.pattern.trim().toLowerCase();
        if (seenPat.has(k)) continue;
        seenPat.add(k);
        await c.query(
          `INSERT INTO category_rules (id, user_id, pattern, category, created_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
          [r.id, r.user_id, r.pattern, r.category, r.created_at ?? null],
        );
        result.category_rules_upserted += 1;
      }
    } else {
      for (const r of rulesMine) {
        const exists = await c.query(`SELECT 1 FROM category_rules WHERE id = $1`, [r.id]);
        if (exists.rowCount) continue;
        try {
          await c.query(
            `INSERT INTO category_rules (id, user_id, pattern, category, created_at)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
            [r.id, r.user_id, r.pattern, r.category, r.created_at ?? null],
          );
          result.category_rules_upserted += 1;
        } catch {
          /* patrón duplicado u otra restricción */
        }
      }
    }

    if (data.webhook?.url?.trim()) {
      await c.query(
        `INSERT INTO user_webhooks (user_id, url, created_at, updated_at)
         VALUES ($1, $2, now(), now())
         ON CONFLICT (user_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
        [userId, data.webhook.url.trim()],
      );
      result.webhook_updated = true;
    }

    for (const ex of data.expenses) {
      if (ex.user_id !== userId) {
        result.expenses_skipped += 1;
        continue;
      }
      if (ex.shared_list_id) {
        const ok = await userCanUseList(c, userId, ex.shared_list_id);
        if (!ok) {
          result.expenses_skipped += 1;
          continue;
        }
      }

      const existingRow = await c.query<{ user_id: string }>(`SELECT user_id FROM expenses WHERE id = $1`, [ex.id]);
      if (existingRow.rows[0] && existingRow.rows[0].user_id !== userId) {
        result.expenses_skipped += 1;
        continue;
      }
      const exists = existingRow.rowCount ? 1 : 0;
      if (exists && onConflict === "skip") {
        result.expenses_skipped += 1;
        continue;
      }

      const dateVal = new Date(ex.date);
      if (Number.isNaN(dateVal.getTime())) {
        result.expenses_skipped += 1;
        continue;
      }
      const dueVal =
        ex.due_date && ex.due_date.trim() !== ""
          ? new Date(ex.due_date)
          : null;
      const dueOut =
        dueVal && !Number.isNaN(dueVal.getTime()) ? dueVal.toISOString() : null;

      await c.query(
        `INSERT INTO expenses (
           id, user_id, amount, currency, category, description, date, tags, notes, source,
           is_income, is_recurring, recurring_frequency, merchant, receipt_url, status, shared_with,
           shared_list_id, due_date, created_at, updated_at, deleted_at
         ) VALUES (
           $1, $2, $3::numeric, $4, $5, $6, $7::timestamptz, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17,
           $18, $19::timestamptz, COALESCE($20::timestamptz, now()), COALESCE($21::timestamptz, now()), $22::timestamptz
         )
         ON CONFLICT (id) DO UPDATE SET
           amount = EXCLUDED.amount,
           currency = EXCLUDED.currency,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           date = EXCLUDED.date,
           tags = EXCLUDED.tags,
           notes = EXCLUDED.notes,
           source = EXCLUDED.source,
           is_income = EXCLUDED.is_income,
           is_recurring = EXCLUDED.is_recurring,
           recurring_frequency = EXCLUDED.recurring_frequency,
           merchant = EXCLUDED.merchant,
           receipt_url = EXCLUDED.receipt_url,
           status = EXCLUDED.status,
           shared_with = EXCLUDED.shared_with,
           shared_list_id = EXCLUDED.shared_list_id,
           due_date = EXCLUDED.due_date,
           updated_at = now(),
           deleted_at = EXCLUDED.deleted_at`,
        [
          ex.id,
          ex.user_id,
          ex.amount,
          ex.currency.toUpperCase().slice(0, 3),
          ex.category ?? null,
          ex.description ?? null,
          dateVal.toISOString(),
          ex.tags ?? null,
          ex.notes ?? null,
          ex.source ?? null,
          ex.is_income ?? false,
          ex.is_recurring ?? false,
          ex.recurring_frequency ?? null,
          ex.merchant ?? null,
          ex.receipt_url ?? null,
          ex.status ?? null,
          ex.shared_with ?? null,
          ex.shared_list_id ?? null,
          dueOut,
          ex.created_at ?? null,
          ex.updated_at ?? null,
          ex.deleted_at ?? null,
        ],
      );
      if (exists) result.expenses_updated += 1;
      else result.expenses_inserted += 1;
    }

    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
