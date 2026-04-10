import jwt, { type JwtPayload as LibJwtPayload, type SignOptions } from "jsonwebtoken";
import type { Env } from "../config/env.js";

export type AccessTokenClaims = { sub: string; email: string };

export function signAccessToken(env: Env, payload: AccessTokenClaims, expiresIn: SignOptions["expiresIn"] = "7d") {
  const options: SignOptions = { expiresIn, subject: payload.sub };
  return jwt.sign({ email: payload.email }, env.JWT_SECRET, options);
}

export function verifyAccessToken(env: Env, token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Token inválido");
  }
  const d = decoded as LibJwtPayload;
  if (!d.sub || typeof d.email !== "string") {
    throw new Error("Token inválido");
  }
  return { sub: d.sub, email: d.email };
}
