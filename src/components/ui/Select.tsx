"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  error,
  disabled,
  className,
  id,
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <div className="relative w-full">
        <select
          id={selectId}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full appearance-none px-3 py-2.5 pr-9 text-sm text-[#31332f] bg-[#f5f4ef] rounded-xl border-0 outline-none shadow-none",
            "focus:bg-[#fbf9f5] focus:ring-2 focus:ring-[#366769]/20",
            "transition-all duration-150 cursor-pointer",
            error && "ring-2 ring-[#a73b21]/30 bg-[#fff7f6]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            !value && "text-[#b2b2ad]",
            className
          )}
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="text-[#31332f]">
              {opt.label}
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#5e605b]"
          style={{ fontSize: "18px" }}
        >
          expand_more
        </span>
      </div>
      {error && (
        <p
          className="text-xs text-[#a73b21]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
