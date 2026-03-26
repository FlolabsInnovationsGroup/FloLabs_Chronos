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
  primary: "bg-[#b9ecee] text-[#104648]",
  secondary: "bg-[#e1e1f5] text-[#3d3e4e]",
  tertiary: "bg-[#fed9b8] text-[#503921]",
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
