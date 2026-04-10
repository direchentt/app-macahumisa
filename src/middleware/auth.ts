import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";

export type AuthedRequest = Request & { userId: string; userEmail: string };

export function requireAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Falta Bearer token" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const { sub, email } = verifyAccessToken(env, token);
      (req as AuthedRequest).userId = sub;
      (req as AuthedRequest).userEmail = email;
      next();
    } catch {
      res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}
