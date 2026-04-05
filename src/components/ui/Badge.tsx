import React from "react";
import { cn } from "@/lib/utils";

type BadgeColor = "primary" | "secondary" | "tertiary" | "custom";

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  dot?: boolean;
  dotColor?: string;
  className?: string;
}

const colorStyles: Record<BadgeColor, string> = {
  primary: "bg-primary-container text-on-primary-fixed",
  secondary: "bg-secondary-fixed text-on-secondary-fixed",
  tertiary: "bg-tertiary-container text-on-tertiary-fixed",
  custom: "",
};

export function Badge({
  children,
  color = "secondary",
  dot = false,
  dotColor,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        colorStyles[color],
        className
      )}
      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor ?? "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
