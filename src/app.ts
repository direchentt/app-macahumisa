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

export function createApp(env: Env, pool: Pool) {
  const appDir = dirname(fileURLToPath(import.meta.url));
  const spaDir = join(appDir, "..", "web", "dist");
  const spaExists = env.NODE_ENV === "production" && existsSync(join(spaDir, "index.html"));

  const app = express();
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Error interno" });
  });

  return app;
}
