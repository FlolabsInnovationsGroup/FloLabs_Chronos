"use client";

import { useMemo } from "react";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { ChronosThemeMode } from "@/lib/chronos-theme";
import { useChronosTheme } from "@/components/theme/ChronosThemeProvider";

const THEME_OPTIONS: Array<{
  value: ChronosThemeMode;
  label: string;
  icon: string;
}> = [
  { value: "system", label: "System", icon: "brightness_auto" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode, mounted, effectiveDark } = useChronosTheme();

  const summary = useMemo(() => {
    if (mode === "system") {
      return effectiveDark ? "Dark (system)" : "Light (system)";
    }
    return mode === "dark" ? "Dark" : "Light";
  }, [mode, effectiveDark]);

  if (!mounted) {
    return (
      <span
        className={cn("inline-flex h-8 w-[4.25rem] shrink-0 rounded-full bg-surface-container-low", className)}
        aria-hidden
      />
    );
  }

  return (
    <Tooltip label={`Theme: ${summary}`} delayMs={300}>
      <div className={cn("shrink-0", className)}>
        <DropdownSelect
          options={THEME_OPTIONS}
          value={mode}
          onChange={(v) => setMode(v as ChronosThemeMode)}
          hideTriggerLabel
          buttonAriaLabel={`Theme: ${summary}. Open menu to choose light, dark, or system.`}
          buttonClassName="min-h-8 h-8 w-auto rounded-full border border-surface-container-highest bg-surface-container-low px-1.5 py-0 text-on-surface-variant hover:bg-surface-container hover:text-on-background gap-1 justify-center"
          className="w-auto"
        />
      </div>
    </Tooltip>
  );
}
