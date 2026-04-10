import dotenv from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
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

const sqlDir = join(projectRoot, "sql");
const files = readdirSync(sqlDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows: tbl } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'users'`,
  );
  if (tbl[0]?.c > 0) {
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES ('001_init.sql') ON CONFLICT (filename) DO NOTHING`,
    );
  }

  for (const f of files) {
    const done = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [f]);
    if (done.rowCount) {
      console.log(`Migración ${f} ya aplicada, se omite.`);
      continue;
    }
    const sql = readFileSync(join(sqlDir, f), "utf8");
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [f]);
    console.log(`Migración ${f} aplicada.`);
  }
} finally {
  await pool.end();
}
