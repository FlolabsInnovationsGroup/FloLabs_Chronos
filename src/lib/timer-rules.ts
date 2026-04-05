import type { ActiveTimer } from "@/types";

export interface TimerStopRequirementState {
  projectId?: string | null | undefined;
  projectRequiresTaskOnStop?: boolean | null | undefined;
  description: string | null | undefined;
  notionTaskPageId: string | null | undefined;
}

export interface TimerStopValidation {
  canStop: boolean;
  missing: Array<"project" | "description" | "task">;
  message: string;
}

export function getTimerStopValidation(
  timer: TimerStopRequirementState | ActiveTimer | null | undefined
): TimerStopValidation {
  const missing: Array<"project" | "description" | "task"> = [];

  if (!timer?.projectId) {
    missing.push("project");
  }

  if (!timer?.description?.trim()) {
    missing.push("description");
  }

  if (timer?.projectRequiresTaskOnStop && !timer?.notionTaskPageId) {
    missing.push("task");
  }

  if (missing.length === 0) {
    return {
      canStop: true,
      missing,
      message: "Ready to stop this timer.",
    };
  }

  const parts = missing.map((field) => {
    if (field === "project") return "a project";
    if (field === "description") return "a description";
    return "a task";
  });

  return {
    canStop: false,
    missing,
    message:
      parts.length === 3
        ? `Add ${parts[0]}, ${parts[1]}, and ${parts[2]} before stopping this timer.`
        : parts.length === 2
          ? `Add ${parts[0]} and ${parts[1]} before stopping this timer.`
          : `Add ${parts[0]} before stopping this timer.`,
  };
}
