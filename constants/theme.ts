
import { Platform } from "react-native";
const tintColorLight = "#2563eb"; 
const tintColorDark = "#60a5fa";

export const Colors = {
  light: {
    text: "#0f172a",
    background: "#e0f2fe", 
    tint: tintColorLight,
    icon: "#0369a1",
    tabIconDefault: "#0369a1",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ffffff",
    background: "#0B1220", 
    tint: tintColorDark,
    icon: "rgba(255,255,255,0.7)",
    tabIconDefault: "rgba(255,255,255,0.55)",
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
