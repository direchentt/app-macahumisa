/** Misma lógica que el servidor: patrones más largos primero, sin distinguir mayúsculas. */
export function findMatchingCategoryRule(
  rules: { pattern: string; category: string }[],
  description: string | null | undefined,
  notes?: string | null | undefined,
): { pattern: string; category: string } | null {
  const haystack = `${description ?? ""} ${notes ?? ""}`.toLowerCase();
  if (!haystack.trim()) return null;
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const r of sorted) {
    const p = r.pattern.trim().toLowerCase();
    if (p && haystack.includes(p)) return r;
  }
  return null;
}
