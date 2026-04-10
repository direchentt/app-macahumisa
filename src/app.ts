import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import type { Pool } from "pg";
import type { Env } from "./config/env.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { budgetsRouter } from "./routes/budgets.routes.js";
import { sharedListsRouter } from "./routes/shared-lists.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { savingsGoalsRouter } from "./routes/savings-goals.routes.js";
import { categoryRulesRouter } from "./routes/category-rules.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { mapServerError } from "./lib/mapServerError.js";
import { requestIdMiddleware, type RequestWithId } from "./middleware/requestId.js";

export function createApp(env: Env, pool: Pool) {
  const appDir = dirname(fileURLToPath(import.meta.url));
  const spaDir = join(appDir, "..", "web", "dist");
  /** Si hay build de Vite en web/dist, servir la app aunque NODE_ENV no sea production (p. ej. Railway sin la var). */
  const spaExists = existsSync(join(spaDir, "index.html"));

  const app = express();
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use(helmet());
  const corsOrigins = env.CORS_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (corsOrigins && corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins.length === 1 ? corsOrigins[0]! : corsOrigins }));
  } else {
    app.use(cors());
  }
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "12mb" }));

  if (!spaExists) {
    app.get("/", (_req, res) => {
      res.json({
        name: "macahumisa-api",
        version: "0.1.0",
        endpoints: {
          health: "/health",
          healthDb: "/health/db",
          register: "POST /api/v1/auth/register",
          login: "POST /api/v1/auth/login",
          me: "GET /api/v1/users/me (Bearer)",
          expenses: "/api/v1/expenses (Bearer)",
          budgets: "/api/v1/budgets (Bearer)",
          sharedLists: "/api/v1/shared-lists (Bearer)",
          notifications: "/api/v1/notifications (Bearer)",
          savingsGoals: "/api/v1/savings-goals (Bearer)",
          categoryRules: "/api/v1/category-rules (Bearer)",
          webhooks: "/api/v1/webhooks (Bearer)",
        },
      });
    });
  }

  app.use(healthRouter(pool));
  app.use("/api/v1/auth", authRouter(pool, env));
  app.use("/api/v1/users", usersRouter(pool, env));
  app.use("/api/v1/expenses", expensesRouter(pool, env));
  app.use("/api/v1/budgets", budgetsRouter(pool, env));
  app.use("/api/v1/shared-lists", sharedListsRouter(pool, env));
  app.use("/api/v1/notifications", notificationsRouter(pool, env));
  app.use("/api/v1/savings-goals", savingsGoalsRouter(pool, env));
  app.use("/api/v1/category-rules", categoryRulesRouter(pool, env));
  app.use("/api/v1/webhooks", webhooksRouter(pool, env));
  app.use("/api/v1/audit", auditRouter(pool, env));

  if (spaExists) {
    app.use(express.static(spaDir));
  }

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "No encontrado" });
      return;
    }
    if (spaExists && (req.method === "GET" || req.method === "HEAD")) {
      res.sendFile(join(spaDir, "index.html"), (err) => {
        if (err) next(err);
      });
      return;
    }
    res.status(404).json({ error: "No encontrado" });
  });

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const rid = (req as RequestWithId).requestId ?? "?";
    console.error("[requestId=%s]", rid, err);
    if (res.headersSent) {
      return;
    }
    const body = mapServerError(err, env.NODE_ENV === "development");
    const errorMsg =
      typeof body.error === "string" && body.error.trim() ? body.error.trim() : "Error interno del servidor.";
    res.status(500).json({ ...body, error: errorMsg, request_id: rid });
  });

  return app;
}
