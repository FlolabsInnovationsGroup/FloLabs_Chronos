"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CHRONOS_THEME_STORAGE_KEY,
  type ChronosThemeMode,
  applyChronosThemeToDocument,
  parseChronosThemeMode,
  resolveDarkFromMode,
} from "@/lib/chronos-theme";

type ChronosThemeContextValue = {
  mode: ChronosThemeMode;
  setMode: (mode: ChronosThemeMode) => void;
  mounted: boolean;
  /** Resolved appearance for icons (follows OS when mode is system). */
  effectiveDark: boolean;
};

const ChronosThemeContext = createContext<ChronosThemeContextValue | null>(null);

export function useChronosTheme(): ChronosThemeContextValue {
  const ctx = useContext(ChronosThemeContext);
  if (!ctx) {
    throw new Error("useChronosTheme must be used within ChronosThemeProvider");
  }
  return ctx;
}

export function ChronosThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ChronosThemeMode | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mql.matches);
    const onMql = () => {
      setSystemPrefersDark(mql.matches);
      const stored = parseChronosThemeMode(localStorage.getItem(CHRONOS_THEME_STORAGE_KEY));
      if (stored === "system") applyChronosThemeToDocument("system");
    };
    mql.addEventListener("change", onMql);
    return () => mql.removeEventListener("change", onMql);
  }, []);

  useEffect(() => {
    const initial = parseChronosThemeMode(localStorage.getItem(CHRONOS_THEME_STORAGE_KEY));
    setModeState(initial);
    applyChronosThemeToDocument(initial);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== CHRONOS_THEME_STORAGE_KEY && e.key !== null) return;
      const next = parseChronosThemeMode(localStorage.getItem(CHRONOS_THEME_STORAGE_KEY));
      setModeState(next);
      applyChronosThemeToDocument(next);
    };
    const onCustom = () => {
      const next = parseChronosThemeMode(localStorage.getItem(CHRONOS_THEME_STORAGE_KEY));
      setModeState(next);
      applyChronosThemeToDocument(next);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("chronos-theme", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("chronos-theme", onCustom);
    };
  }, []);

  useEffect(() => {
    if (mode === null) return;
    applyChronosThemeToDocument(mode);
    localStorage.setItem(CHRONOS_THEME_STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: ChronosThemeMode) => {
    localStorage.setItem(CHRONOS_THEME_STORAGE_KEY, next);
    setModeState(next);
    applyChronosThemeToDocument(next);
    window.dispatchEvent(new Event("chronos-theme"));
  }, []);

  const effectiveDark = useMemo(() => {
    if (mode === null) return false;
    return resolveDarkFromMode(mode, systemPrefersDark);
  }, [mode, systemPrefersDark]);

  const value = useMemo<ChronosThemeContextValue>(
    () => ({
      mode: mode ?? "system",
      setMode,
      mounted: mode !== null,
      effectiveDark,
    }),
    [mode, setMode, effectiveDark]
  );

  return <ChronosThemeContext.Provider value={value}>{children}</ChronosThemeContext.Provider>;
}
