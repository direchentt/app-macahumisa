import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Pool } from "pg";
import type { Env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimit.js";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRouter(pool: Pool, env: Env) {
  const r = Router();

  r.post("/register", registerRateLimiter, async (req, res) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password, first_name, last_name } = parsed.data;
    const password_hash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email.toLowerCase(), password_hash, first_name ?? null, last_name ?? null],
      );
      const id = rows[0].id;
      const token = signAccessToken(env, { sub: id, email: email.toLowerCase() });
      res.status(201).json({ user: { id, email: email.toLowerCase() }, access_token: token });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        res.status(409).json({ error: "El email ya está registrado" });
        return;
      }
      throw e;
    }
  });

  r.post("/login", loginRateLimiter, async (req, res) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;
    const { rows } = await pool.query<{
      id: string;
      password_hash: string;
      deleted_at: Date | null;
    }>(
      `SELECT id, password_hash, deleted_at FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    const user = rows[0];
    if (!user || user.deleted_at) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }
    const token = signAccessToken(env, { sub: user.id, email: email.toLowerCase() });
    res.json({ user: { id: user.id, email: email.toLowerCase() }, access_token: token });
  });

  return r;
}
