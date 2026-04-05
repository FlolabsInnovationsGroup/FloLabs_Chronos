"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none",
          "placeholder:text-outline-variant",
          "focus:bg-background focus:ring-2 focus:ring-primary/20",
          "transition-all duration-150",
          error && "ring-2 ring-error/30 bg-warm-surface",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        {...props}
      />
      {error && (
        <p
          className="text-xs text-error"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          className="text-xs text-on-surface-variant"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function Textarea({ label, error, hint, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none resize-none",
          "placeholder:text-outline-variant",
          "focus:bg-background focus:ring-2 focus:ring-primary/20",
          "transition-all duration-150",
          error && "ring-2 ring-error/30 bg-warm-surface",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        {...props}
      />
      {error && (
        <p
          className="text-xs text-error"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          className="text-xs text-on-surface-variant"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
