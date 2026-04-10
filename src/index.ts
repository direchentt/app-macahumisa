import { loadEnv } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { createApp } from "./app.js";

const env = loadEnv();
const pool = createPool(env);
const app = createApp(env, pool);

app.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}`);
});
