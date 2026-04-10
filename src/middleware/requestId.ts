import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export type RequestWithId = Request & { requestId?: string };

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].trim()
    ? req.headers["x-request-id"].trim().slice(0, 128)
    : randomUUID();
  (req as RequestWithId).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
