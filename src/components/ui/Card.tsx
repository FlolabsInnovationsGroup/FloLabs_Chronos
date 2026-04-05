import React from "react";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "tonal";

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface-container-lowest",
  tonal: "bg-surface-container-low",
};

export function Card({ variant = "default", className, children, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl paper-shadow",
        variantStyles[variant],
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
