import type { ActiveTimer } from "@/types";

export interface TimerStopRequirementState {
  description: string | null | undefined;
  notionTaskPageId: string | null | undefined;
}

export interface TimerStopValidation {
  canStop: boolean;
  missing: Array<"description" | "task">;
  message: string;
}

export function getTimerStopValidation(
  timer: TimerStopRequirementState | ActiveTimer | null | undefined
): TimerStopValidation {
  const missing: Array<"description" | "task"> = [];

  if (!timer?.description?.trim()) {
    missing.push("description");
  }

  if (!timer?.notionTaskPageId) {
    missing.push("task");
  }

  if (missing.length === 0) {
    return {
      canStop: true,
      missing,
      message: "Ready to stop this timer.",
    };
  }

  const parts = missing.map((field) => (field === "description" ? "a description" : "a task"));

  return {
    canStop: false,
    missing,
    message:
      parts.length === 2
        ? `Add ${parts[0]} and ${parts[1]} before stopping this timer.`
        : `Add ${parts[0]} before stopping this timer.`,
  };
}
