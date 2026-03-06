import { AppTheme } from "./theme-mode";

type AvatarPalette = {
  background: string;
  text: string;
};

function hashKey(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toSeed(normalized: string): number {
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) {
    return Math.abs(Math.floor(asNumber)) >>> 0;
  }
  return hashKey(normalized);
}

function spreadHue(seed: number): number {
  // Golden-angle spacing keeps nearby numeric ids visually far apart.
  return Math.floor((seed * 137.50776405) % 360);
}

export function getNameInitials(fullName?: string): string {
  const value = (fullName || "").trim();
  if (!value) return "U";

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

export function getAvatarPaletteForKey(
  theme: AppTheme,
  key?: string | number | null
): AvatarPalette {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!normalized) {
    return theme.mode === "dark"
      ? { background: "#3b2332", text: "#fda4af" }
      : { background: "#ffe4ea", text: "#e11d48" };
  }

  const seed = toSeed(normalized);
  const hue = spreadHue(seed);
  const satJitter = seed % 12;
  const lightJitter = (seed >>> 3) % 8;

  if (theme.mode === "dark") {
    return {
      background: `hsl(${hue} ${40 + satJitter}% ${24 + lightJitter}%)`,
      text: `hsl(${hue} 90% 84%)`,
    };
  }

  return {
    background: `hsl(${hue} ${72 + satJitter}% ${88 + lightJitter}%)`,
    text: `hsl(${hue} 68% 30%)`,
  };
}
