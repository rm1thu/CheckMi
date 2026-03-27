import * as SecureStore from "expo-secure-store";

const TAB_TOAST_KEY = "tab_toast_payload";

export type TabToast = {
  title: string;
  message: string;
};

type TabToastListener = (toast: TabToast) => void;

const listeners = new Set<TabToastListener>();

function normalizeToast(value: unknown): TabToast | null {
  if (!value || typeof value !== "object") return null;

  const title = (value as { title?: unknown }).title;
  const message = (value as { message?: unknown }).message;

  if (typeof title !== "string" || typeof message !== "string") return null;
  return { title, message };
}

export async function queueTabToast(toast: TabToast) {
  await SecureStore.setItemAsync(TAB_TOAST_KEY, JSON.stringify(toast));
}

export async function consumeQueuedTabToast(): Promise<TabToast | null> {
  const raw = await SecureStore.getItemAsync(TAB_TOAST_KEY);
  if (!raw) return null;

  await SecureStore.deleteItemAsync(TAB_TOAST_KEY);

  try {
    return normalizeToast(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function showTabToast(toast: TabToast) {
  const normalized = normalizeToast(toast);
  if (!normalized) return;

  for (const listener of listeners) {
    listener(normalized);
  }
}

export function subscribeToTabToast(listener: TabToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
