import { useThemeMode } from "@/src/theme-mode";

export function useColorScheme() {
  return useThemeMode().resolvedScheme;
}
