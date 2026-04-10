import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET debe ser largo (mín. 16 caracteres)"),
  /** Orígenes CORS permitidos (coma). Ej: https://app.tudominio.com — obligatorio si el front está en otro dominio que la API. */
  CORS_ORIGIN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Variables de entorno inválidas: ${JSON.stringify(msg)}`);
  }
  return parsed.data;
}
