export type SavingsGoalLike = {
  target_amount: string;
  saved_amount: string;
  deadline: string | null;
  created_at: string;
};

/** Orientativo: ritmo vs. plazo hasta la fecha límite. */
export function savingsGoalInsight(g: SavingsGoalLike): string | null {
  if (!g.deadline) return null;
  const end = new Date(g.deadline.includes("T") ? g.deadline : `${g.deadline}T23:59:59`).getTime();
  const start = new Date(g.created_at).getTime();
  const now = Date.now();
  const target = Number(g.target_amount);
  const saved = Number(g.saved_amount);
  if (target <= 0) return null;
  const pct = Math.min(100, (saved / target) * 100);
  if (end <= now) {
    return pct < 99 ? "Meta vencida sin completar" : null;
  }
  const total = end - start;
  const elapsed = now - start;
  if (total <= 0 || elapsed <= 0) return null;
  const expectedPct = Math.min(100, (elapsed / total) * 100);
  if (pct + 8 < expectedPct) return "Ritmo por debajo del plazo";
  if (pct > expectedPct + 12) return "Buen ritmo vs. plazo";
  return null;
}
