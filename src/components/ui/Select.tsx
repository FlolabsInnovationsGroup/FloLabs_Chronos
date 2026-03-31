"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { DropdownSelect } from "./DropdownSelect";

interface SelectOption {
  value: string;
  label: string;
  color?: string;
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
  const labelId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      {label && (
        <label
          htmlFor={labelId}
          className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
      )}
      <DropdownSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        buttonClassName={error ? "ring-2 ring-[#a73b21]/30 bg-[#fff7f6]" : undefined}
      />
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
