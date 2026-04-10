/** Límites [start, end) en UTC para interpretar `budgets.period`. */
export function periodBounds(period: string, ref = new Date()): { start: Date; end: Date } {
  const p = period.toLowerCase().trim();

  if (p === "weekly" || p === "week") {
    const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + mondayOffset);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }

  if (p === "yearly" || p === "year") {
    const start = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
    const end = new Date(Date.UTC(ref.getUTCFullYear() + 1, 0, 1));
    return { start, end };
  }

  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
  return { start, end };
}
