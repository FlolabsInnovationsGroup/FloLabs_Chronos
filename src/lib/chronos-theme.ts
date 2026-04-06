export const CHRONOS_THEME_STORAGE_KEY = "chronos-theme";

export type ChronosThemeMode = "light" | "dark" | "system";

export function parseChronosThemeMode(stored: string | null): ChronosThemeMode {
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveDarkFromMode(mode: ChronosThemeMode, prefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

export function applyChronosThemeToDocument(mode: ChronosThemeMode): void {
  if (typeof document === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = resolveDarkFromMode(mode, prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}
