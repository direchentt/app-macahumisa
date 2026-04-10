/** Una entrada por usuario (UUID) para que varias cuentas en el mismo navegador no compartan el estado. */
export function onboardingStorageKey(userId: string): string {
  return `macahumisa_onboarding_v1:${userId}`;
}

export function isOnboardingComplete(userId: string | null): boolean {
  if (!userId) return false;
  return localStorage.getItem(onboardingStorageKey(userId)) === "1";
}

export function setOnboardingComplete(userId: string | null): void {
  if (!userId) return;
  localStorage.setItem(onboardingStorageKey(userId), "1");
}
