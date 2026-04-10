# Publicar Macahumisa en internet (celular y escritorio)

La API puede servir la **web ya compilada** (`web/dist`) en el mismo dominio: no necesitás `VITE_API_URL` si todo va a la misma URL pública.

## 1. Base de datos

1. Creá una base PostgreSQL (Supabase, Neon, Railway Postgres, Render Postgres, etc.).
2. Copiá la **connection string** (URI `postgresql://...` o `postgres://...`).
3. En tu máquina, con el mismo `.env` de producción o exportando `DATABASE_URL`:

   ```bash
   npm run db:migrate
   ```

## 2. Variables de entorno en el host

| Variable        | Obligatoria | Notas                                      |
|----------------|-------------|--------------------------------------------|
| `DATABASE_URL` | Sí          | URI de Postgres                            |
| `JWT_SECRET`   | Sí          | Mínimo 16 caracteres, aleatorio en prod    |
| `NODE_ENV`     | Recomendado | `production`                               |
| `PORT`         | A veces     | Muchos hosts lo inyectan solos             |
| `CORS_ORIGIN`  | Solo si…    | El front vive en **otro** dominio que la API (lista separada por comas) |

No subas `.env` al repositorio (está en `.gitignore`).

## 3. Build y arranque local (como en el servidor)

```bash
npm run build:all
NODE_ENV=production node dist/index.js
```

Abrí `http://localhost:3000` (o el `PORT` que uses): deberías ver el login y la API en `/api/v1/...`.

## 4. Docker (Fly.io, Railway, Render con Dockerfile, etc.)

```bash
docker build -t macahumisa .
docker run -p 3000:3000 -e DATABASE_URL=... -e JWT_SECRET=... macahumisa
```

Configurá las mismas variables en el panel del proveedor.

## 5. Git

```bash
git init   # si aún no hay repo
git add .
git commit -m "Macahumisa: listo para deploy"
```

En GitHub/GitLab podés conectar el repo a **Railway**, **Render** o **Fly.io** con build `npm run build:all` y start `node dist/index.js`, o usando este `Dockerfile`.

## 6. Front en otro dominio (Vercel + API en Railway)

1. Deploy de la API con `CORS_ORIGIN=https://tu-proyecto.vercel.app`.
2. Build del front con `VITE_API_URL=https://tu-api.railway.app` (sin barra final).

---

Si algo falla, revisá los logs del servidor: cada error 500 incluye `request_id` en el JSON y en consola.
