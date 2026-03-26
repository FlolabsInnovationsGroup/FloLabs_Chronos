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
          className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none",
          "placeholder:text-[#b2b2ad]",
          "focus:bg-white focus:ring-2 focus:ring-[#366769]/20",
          "transition-all duration-150",
          error && "ring-2 ring-[#a73b21]/30 bg-[#fff7f6]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        {...props}
      />
      {error && (
        <p
          className="text-xs text-[#a73b21]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          className="text-xs text-[#5e605b]"
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
          className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          "w-full px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none resize-none",
          "placeholder:text-[#b2b2ad]",
          "focus:bg-white focus:ring-2 focus:ring-[#366769]/20",
          "transition-all duration-150",
          error && "ring-2 ring-[#a73b21]/30 bg-[#fff7f6]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        {...props}
      />
      {error && (
        <p
          className="text-xs text-[#a73b21]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          className="text-xs text-[#5e605b]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
