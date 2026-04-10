import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { z } from "zod";

const __dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dir, "..");
dotenv.config({ path: join(projectRoot, ".env") });

const parsed = z.object({ DATABASE_URL: z.string().url() }).safeParse(process.env);
if (!parsed.success) {
  console.error(
    "No se encontró DATABASE_URL.\n" +
      "1) En la carpeta del proyecto creá el archivo .env (no solo .env.example).\n" +
      "2) Dentro poné: DATABASE_URL=postgresql://... (copiá la URI de Supabase → Settings → Database).\n" +
      "3) Volvé a ejecutar: npm run db:migrate",
  );
  process.exit(1);
}
const env = parsed.data;
const sqlPath = join(__dir, "..", "sql", "001_init.sql");
const sql = readFileSync(sqlPath, "utf8");

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log("Migración 001_init.sql aplicada.");
} finally {
  await pool.end();
}
