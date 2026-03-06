import * as SecureStore from "expo-secure-store";

export const PREFS_KEY = "checkmi_prefs_v1";

export type AppPrefs = {
  notificationsEnabled?: boolean;
  magnifiedCardsEnabled?: boolean;
  darkModeEnabled?: boolean;
  [key: string]: unknown;
};

type ResolvedAppPrefs = AppPrefs & {
  notificationsEnabled: boolean;
  magnifiedCardsEnabled: boolean;
};

const DEFAULT_PREFS: Pick<
  ResolvedAppPrefs,
  "notificationsEnabled" | "magnifiedCardsEnabled"
> = {
  notificationsEnabled: true,
  magnifiedCardsEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadAppPrefs(): Promise<ResolvedAppPrefs> {
  let parsed: Record<string, unknown> = {};

  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY);
    if (raw) {
      const maybe = JSON.parse(raw);
      if (isRecord(maybe)) parsed = maybe;
    }
  } catch {
  }

  return {
    ...parsed,
    notificationsEnabled:
      typeof parsed.notificationsEnabled === "boolean"
        ? parsed.notificationsEnabled
        : DEFAULT_PREFS.notificationsEnabled,
    magnifiedCardsEnabled:
      typeof parsed.magnifiedCardsEnabled === "boolean"
        ? parsed.magnifiedCardsEnabled
        : DEFAULT_PREFS.magnifiedCardsEnabled,
  };
}

export async function saveAppPrefs(next: Partial<AppPrefs>): Promise<ResolvedAppPrefs> {
  const current = await loadAppPrefs();
  const merged: ResolvedAppPrefs = { ...current, ...next };
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(merged));
  return merged;
}
