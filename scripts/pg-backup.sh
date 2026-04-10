#!/usr/bin/env bash
# Volcado lógico de la base (pg_dump). Requiere `pg_dump` en PATH y DATABASE_URL.
set -euo pipefail
: "${DATABASE_URL:?Definí DATABASE_URL (ej. en .env)}"
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/macahumisa-${STAMP}.dump"
echo "Generando $OUT ..."
pg_dump "$DATABASE_URL" --no-owner --format=custom -f "$OUT"
echo "Listo: $OUT"
