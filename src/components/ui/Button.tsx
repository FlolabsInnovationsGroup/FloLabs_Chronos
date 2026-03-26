"use client";

import React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#366769] text-[#e3feff] hover:bg-[#295a5d] active:bg-[#104648] disabled:opacity-50",
  secondary:
    "bg-[#e1e1f5] text-[#3d3e4e] hover:bg-[#d3d3e6] active:bg-[#c5c5d8] disabled:opacity-50",
  ghost:
    "bg-transparent text-[#5e605b] hover:bg-[#f5f4ef] active:bg-[#efeee9] disabled:opacity-50",
  danger:
    "bg-transparent text-[#a73b21] hover:bg-[#fff7f6] active:bg-[#fde0d9] disabled:opacity-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-body font-medium rounded-full transition-colors duration-150 cursor-pointer select-none whitespace-nowrap",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
