# Build API + SPA estático; un solo proceso sirve / y /api (ver src/app.ts)
# npm install (no npm ci): evita fallos en Linux cuando el lock tuvo huecos en deps opcionales (p. ej. Vitest/Rolldown).
FROM node:22-alpine AS build
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm install --no-audit --no-fund && npm install --prefix web --no-audit --no-fund

COPY tsconfig.json ./
COPY sql ./sql
COPY scripts ./scripts
COPY src ./src
COPY web ./web

RUN npm run build:all

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
