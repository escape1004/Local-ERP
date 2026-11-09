export function isProfileHydrationPending(
  currentProfile: { id: string } | null | undefined,
  isProfileReady: boolean,
): boolean {
  return Boolean(currentProfile) && !isProfileReady;
}

export function shouldHideAppUntilReady(
  requiresPassword: boolean,
  isProfileReady: boolean,
): boolean {
  return requiresPassword || !isProfileReady;
}
