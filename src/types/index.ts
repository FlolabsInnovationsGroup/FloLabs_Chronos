export type Role = "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  archived: boolean;
  createdAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  tagId: string | null;
  description: string;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMs: number | null;
  notionPageId?: string | null;
  syncedAt?: Date | null;
  updatedAt?: Date;
  createdAt: Date;
  // Joined fields
  user?: Pick<User, "id" | "name" | "email">;
  project?: Pick<Project, "id" | "name" | "color" | "icon">;
  tag?: Pick<Tag, "id" | "name" | "color"> | null;
}

export interface ActiveTimer {
  userId: string;
  projectId: string;
  tagId: string | null;
  description: string;
  startedAt: number; // Unix ms timestamp
}

export interface SSEEvent {
  type: "timer:start" | "timer:stop" | "heartbeat";
  userId?: string;
  data?: ActiveTimer | null;
}

export interface ReportFilters {
  userId?: string;
  projectId?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  groupBy?: "day" | "week" | "month" | "user" | "project";
}

export interface ReportRow {
  label: string;
  totalMs: number;
  entryCount: number;
  entries?: TimeEntry[];
}
