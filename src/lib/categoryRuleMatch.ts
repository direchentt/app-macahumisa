/** Primera regla cuyo patrón aparece en el texto (sin distinguir mayúsculas). Orden: patrones más largos primero. */
export function pickCategoryFromRules(
  rules: { pattern: string; category: string }[],
  description: string | null | undefined,
  notes: string | null | undefined,
): string | null {
  const haystack = `${description ?? ""} ${notes ?? ""}`.toLowerCase();
  if (!haystack.trim()) return null;
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const r of sorted) {
    const p = r.pattern.trim().toLowerCase();
    if (p && haystack.includes(p)) return r.category;
  }
  return null;
}
