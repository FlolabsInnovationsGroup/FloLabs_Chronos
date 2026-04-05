"use client";

import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "chronos-theme";

function readTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(readTheme());
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  }, []);

  if (!mounted) {
    return (
      <span
        className={cn("inline-flex h-8 w-8 shrink-0 rounded-full bg-surface-container-low", className)}
        aria-hidden
      />
    );
  }

  return (
    <Tooltip label={dark ? "Switch to light theme" : "Switch to dark theme"} delayMs={300}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-surface-container-highest bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-background",
          className
        )}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
          {dark ? "light_mode" : "dark_mode"}
        </span>
      </button>
    </Tooltip>
  );
}
