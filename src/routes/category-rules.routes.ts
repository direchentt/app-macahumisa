import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const uuid = z.string().uuid();

const createBody = z
  .object({
    pattern: z.string().min(1).max(200),
    category: z.string().min(1).max(50),
  })
  .strict();

export type CategoryRuleRow = {
  id: string;
  user_id: string;
  pattern: string;
  category: string;
  created_at: string;
};

export function categoryRulesRouter(pool: Pool, env: Env) {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req, res) => {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query<CategoryRuleRow>(
      `SELECT id, user_id, pattern, category, created_at
       FROM category_rules WHERE user_id = $1
       ORDER BY length(pattern) DESC, created_at ASC`,
      [userId],
    );
    res.json({ rules: rows });
  });

  r.post("/", auth, async (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthedRequest;
    const b = parsed.data;
    try {
      const { rows } = await pool.query<CategoryRuleRow>(
        `INSERT INTO category_rules (user_id, pattern, category)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, pattern, category, created_at`,
        [userId, b.pattern.trim(), b.category.trim()],
      );
      res.status(201).json({ rule: rows[0] });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(409).json({ error: "Ya existe una regla con el mismo patrón (sin distinguir mayúsculas)." });
        return;
      }
      throw e;
    }
  });

  r.delete("/:id", auth, async (req, res) => {
    const idParse = uuid.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const { userId } = req as AuthedRequest;
    const { rowCount } = await pool.query(`DELETE FROM category_rules WHERE id = $1 AND user_id = $2`, [
      idParse.data,
      userId,
    ]);
    if (!rowCount) {
      res.status(404).json({ error: "Regla no encontrada" });
      return;
    }
    res.status(204).send();
  });

  return r;
}
