"use client";

interface InlineSearchLoadingProps {
  label?: string;
}

export function InlineSearchLoading({ label = "Searching…" }: InlineSearchLoadingProps) {
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-on-surface-variant"
      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      aria-live="polite"
    >
      <svg className="h-3.5 w-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}
