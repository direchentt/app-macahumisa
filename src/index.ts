import "express-async-errors";
import dns from "node:dns";
import { loadEnv } from "./config/env.js";

/** Evita ENETUNREACH a Postgres cuando el hostname resuelve solo a IPv6 y el host no tiene ruta IPv6 (común en Docker/Railway). */
dns.setDefaultResultOrder("ipv4first");
import { createPool } from "./db/pool.js";
import { createApp } from "./app.js";

const env = loadEnv();
const pool = createPool(env);
const app = createApp(env, pool);

app.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`);
});
