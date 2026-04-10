# Macahumisa

Monorepo: **API REST** (Node.js, Express, TypeScript, PostgreSQL) + **web** (React, Vite). Gastos, presupuestos, listas compartidas, notificaciones y email opcional (SendGrid).

## Requisitos

- Node.js **20+**
- PostgreSQL (local o [Supabase](https://supabase.com))

## Configuración rápida (desarrollo)

1. Clonar e instalar API:

   ```bash
   npm install
   cp .env.example .env
   ```

2. Completar `.env`: `DATABASE_URL`, `JWT_SECRET` (mín. 16 caracteres). Opcional: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`.

3. Migraciones:

   ```bash
   npm run db:migrate
   ```

4. Instalar y levantar la web:

   ```bash
   npm install --prefix web
   ```

5. Dos terminales:

   ```bash
   npm run dev          # API → http://localhost:3000
   npm run dev:web      # UI  → http://localhost:5173 (proxy /api → 3000)
   ```

## Scripts útiles (raíz)

| Script        | Descripción                          |
|---------------|--------------------------------------|
| `npm run dev` | API en modo watch                    |
| `npm run dev:web` | Web Vite                         |
| `npm run build` | Compila solo API → `dist/`       |
| `npm run build:web` | Compila solo web → `web/dist/` |
| `npm run build:all` | API + web (para Docker)        |
| `npm run db:migrate` | Aplica `sql/*.sql` versionados |
| `npm test`    | Vitest (permisos y períodos)         |

## Producción: Docker (API + SPA en un solo puerto)

Build multi-stage: compila la web y la API; en `NODE_ENV=production` el servidor sirve `web/dist` y las rutas `/api/v1/*`.

```bash
docker build -t macahumisa .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  macahumisa
```

Abrir **http://localhost:3000** (interfaz) y **http://localhost:3000/health** (salud).

Con Docker Compose (variables en `.env` al lado del archivo):

```bash
docker compose up --build
```

## Deploy en Render

El repo incluye `render.yaml` (**runtime: docker**). Conectá el repositorio, definí `DATABASE_URL` y `JWT_SECRET` en el panel (y SendGrid si querés emails).

Tras el primer deploy, ejecutá migraciones contra la misma base (localmente con `DATABASE_URL` de producción o SQL en el editor de Supabase).

## Web en dominio distinto al de la API

En build de la web:

```bash
echo 'VITE_API_URL=https://tu-api.com' > web/.env
npm run build --prefix web
```

Si API y SPA van en el mismo contenedor/host, **no hace falta** `VITE_API_URL`.

## Estructura

```
├── src/                 # API Express
├── sql/                 # Migraciones numeradas
├── scripts/migrate.ts
├── web/                 # React + Vite
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

## Licencia

Privado / uso del autor del proyecto.
