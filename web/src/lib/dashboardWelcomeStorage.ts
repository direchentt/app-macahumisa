/** Banner compacto en Gastos: una clave por usuario. */
export function dashboardWelcomeStorageKey(userId: string): string {
  return `macahumisa_dash_welcome_v1:${userId}`;
}

export function isDashboardWelcomeDismissed(userId: string | null): boolean {
  if (!userId) return true;
  return localStorage.getItem(dashboardWelcomeStorageKey(userId)) === "1";
}

export function setDashboardWelcomeDismissed(userId: string | null): void {
  if (!userId) return;
  localStorage.setItem(dashboardWelcomeStorageKey(userId), "1");
}
