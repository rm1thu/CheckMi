import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

const THEME_PREFERENCE_KEY = "checkmi_theme_preference_v1";
const LEGACY_PREFS_KEY = "checkmi_prefs_v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export type AppTheme = {
  mode: ResolvedTheme;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  shadow: string;
  primary: string;
  primaryStrong: string;
  primaryText: string;
  danger: string;
  warning: string;
  success: string;
  overlay: string;
  chip: string;
  input: string;
};

export const APP_THEMES: Record<ResolvedTheme, AppTheme> = {
  light: {
    mode: "light",
    background: "#f4f6fb",
    surface: "#ffffff",
    surfaceAlt: "#f9fafb",
    surfaceSoft: "#e5e7eb",
    textPrimary: "#111827",
    textSecondary: "#6b7280",
    textMuted: "#9ca3af",
    border: "#e5e7eb",
    shadow: "#000000",
    primary: "#2563eb",
    primaryStrong: "#050816",
    primaryText: "#ffffff",
    danger: "#b91c1c",
    warning: "#b45309",
    success: "#34d399",
    overlay: "rgba(0,0,0,0.3)",
    chip: "#e5e7eb",
    input: "#ffffff",
  },
  dark: {
    mode: "dark",
    background: "#0b1220",
    surface: "#111827",
    surfaceAlt: "#1f2937",
    surfaceSoft: "#374151",
    textPrimary: "#f9fafb",
    textSecondary: "#d1d5db",
    textMuted: "#9ca3af",
    border: "#374151",
    shadow: "#000000",
    primary: "#60a5fa",
    primaryStrong: "#1d4ed8",
    primaryText: "#ffffff",
    danger: "#f87171",
    warning: "#fbbf24",
    success: "#34d399",
    overlay: "rgba(0,0,0,0.55)",
    chip: "#1f2937",
    input: "#1f2937",
  },
};

type ThemeModeContextValue = {
  preference: ThemePreference;
  resolvedScheme: ResolvedTheme;
  darkModeEnabled: boolean;
  hydrated: boolean;
  setPreference: (next: ThemePreference) => Promise<void>;
  setDarkModeEnabled: (enabled: boolean) => Promise<void>;
};

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(
  undefined
);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function resolveScheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark"
): ResolvedTheme {
  if (preference === "system") return systemScheme;
  return preference;
}

async function loadStoredPreference(): Promise<ThemePreference> {
  try {
    const storedPreference = await SecureStore.getItemAsync(
      THEME_PREFERENCE_KEY
    );
    if (isThemePreference(storedPreference)) {
      return storedPreference;
    }
  } catch {
    // ignore secure-store read failures
  }

  try {
    const legacyRaw = await SecureStore.getItemAsync(LEGACY_PREFS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { darkModeEnabled?: boolean };
      if (typeof parsed.darkModeEnabled === "boolean") {
        return parsed.darkModeEnabled ? "dark" : "light";
      }
    }
  } catch {
    // ignore legacy parse/read failures
  }

  return "system";
}

export function ThemeModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useSystemColorScheme() === "dark" ? "dark" : "light";
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      const initialPreference = await loadStoredPreference();
      if (mounted) {
        setPreferenceState(initialPreference);
        setHydrated(true);
      }
    };

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);

    try {
      await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, next);
    } catch {
      // ignore secure-store write failures
    }

    try {
      const legacyRaw = await SecureStore.getItemAsync(LEGACY_PREFS_KEY);
      const legacy = legacyRaw
        ? (JSON.parse(legacyRaw) as Record<string, unknown>)
        : {};

      legacy.darkModeEnabled = next === "dark";
      await SecureStore.setItemAsync(LEGACY_PREFS_KEY, JSON.stringify(legacy));
    } catch {
      // ignore legacy compatibility write failures
    }
  }, []);

  const setDarkModeEnabled = useCallback(
    async (enabled: boolean) => {
      await setPreference(enabled ? "dark" : "light");
    },
    [setPreference]
  );

  const resolvedScheme = resolveScheme(preference, systemScheme);
  const darkModeEnabled = resolvedScheme === "dark";

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      preference,
      resolvedScheme,
      darkModeEnabled,
      hydrated,
      setPreference,
      setDarkModeEnabled,
    }),
    [
      darkModeEnabled,
      hydrated,
      preference,
      resolvedScheme,
      setDarkModeEnabled,
      setPreference,
    ]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const fallbackSystemScheme = useSystemColorScheme() === "dark" ? "dark" : "light";
  const context = useContext(ThemeModeContext);

  if (context) return context;

  return {
    preference: "system" as ThemePreference,
    resolvedScheme: fallbackSystemScheme as ResolvedTheme,
    darkModeEnabled: fallbackSystemScheme === "dark",
    hydrated: true,
    setPreference: async () => {},
    setDarkModeEnabled: async () => {},
  };
}

export function useAppTheme(): AppTheme {
  const { resolvedScheme } = useThemeMode();
  return APP_THEMES[resolvedScheme];
}
