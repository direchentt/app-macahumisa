/**
 * Símbolos curados (geométricos / tipográficos / notación), no caritas.
 * Mantener alineado con web/src/lib/avatarOptions.ts
 */
export const AVATAR_OPTIONS = [
  { slug: "diamond-open", char: "◇", label: "Diamante abierto" },
  { slug: "diamond-solid", char: "◆", label: "Diamante sólido" },
  { slug: "diamond-dot", char: "◈", label: "Diamante con punto" },
  { slug: "bullseye", char: "◎", label: "Diana" },
  { slug: "circle-dot", char: "◉", label: "Círculo y punto" },
  { slug: "moon-wane", char: "◐", label: "Luna menguante" },
  { slug: "moon-wax", char: "◑", label: "Luna creciente" },
  { slug: "moon-last", char: "◒", label: "Cuarto menguante" },
  { slug: "moon-first", char: "◓", label: "Cuarto creciente" },
  { slug: "spark-four", char: "✦", label: "Destello de cuatro" },
  { slug: "spark-small", char: "✧", label: "Destello fino" },
  { slug: "spark-six", char: "✶", label: "Asterisco de seis" },
  { slug: "spark-eight", char: "✹", label: "Estrella de ocho" },
  { slug: "rosette", char: "❋", label: "Roseta" },
  { slug: "lozenge-ornament", char: "❖", label: "Rombo doble" },
  { slug: "reference-mark", char: "※", label: "Marca de referencia" },
  { slug: "asterism", char: "⁂", label: "Asterismo" },
  { slug: "helm", char: "⎈", label: "Timón" },
  { slug: "atom", char: "⚛", label: "Átomo" },
  { slug: "oplus", char: "⊕", label: "Más en círculo" },
  { slug: "fisheye", char: "⦿", label: "Ojo de pez" },
  { slug: "star-op", char: "⋆", label: "Estrella operador" },
  { slug: "triple-ast", char: "⸙", label: "Triple asterisco" },
  { slug: "ring", char: "◯", label: "Anillo" },
  { slug: "wedge", char: "⟐", label: "Cuña blanca" },
  { slug: "saltire", char: "⨯", label: "Cruz de San Andrés" },
  { slug: "bowtie", char: "⋈", label: "Lazo" },
  { slug: "hourglass", char: "⧖", label: "Reloj de arena" },
  { slug: "mho", char: "℧", label: "Mho (conductancia)" },
  { slug: "turned-amp", char: "⅋", label: "Ampersand invertido" },
  { slug: "wp", char: "℘", label: "Weierstrass p" },
  { slug: "aleph", char: "ℵ", label: "Aleph" },
  { slug: "estimated", char: "℮", label: "Estimado" },
  { slug: "ounce", char: "℥", label: "Onza" },
  { slug: "prescription", char: "℞", label: "Receta" },
] as const;

export type AvatarSlug = (typeof AVATAR_OPTIONS)[number]["slug"];

/** Para z.enum (requiere tupla no vacía). */
export const AVATAR_SLUGS_FOR_ZOD = AVATAR_OPTIONS.map((o) => o.slug) as [string, ...string[]];

const SLUG_SET = new Set<string>(AVATAR_SLUGS_FOR_ZOD);

export function isValidAvatarSlug(s: string): boolean {
  return SLUG_SET.has(s);
}
