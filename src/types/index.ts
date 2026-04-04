export type Role = "admin" | "team_lead" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  isActive: boolean;
  weeklyTargetHours: number | null;
  createdAt: Date;
  updatedAt: Date;
  team?: Pick<Team, "id" | "name" | "slug"> | null;
  teams?: Pick<Team, "id" | "name" | "slug" | "isActive">[];
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  notionPageId?: string | null;
  generalWebhookUrl?: string | null;
  meetingsWebhookUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invitation {
  id: string;
  email: string;
  name: string;
  role: Exclude<Role, "admin">;
  teamId: string;
  teamIds?: string[];
  token: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  team?: Pick<Team, "id" | "name" | "slug">;
  teams?: Pick<Team, "id" | "name" | "slug">[];
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
  userId: string;
  createdAt?: Date;
  // Optional: for admin views
  user?: Pick<User, "id" | "name"> | null;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string | null;
  description: string;
  notionTaskPageId?: string | null;
  notionTaskTitle?: string | null;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMs: number | null;
  editedField: 'start' | 'end' | null;
  notionPageId?: string | null;
  syncedAt?: Date | null;
  updatedAt?: Date;
  createdAt: Date;
  // Joined fields
  user?: Pick<User, "id" | "name" | "email">;
  project?: Pick<Project, "id" | "name" | "color" | "icon">;
  tags?: Pick<Tag, "id" | "name">[];
}

export interface ActiveTimer {
  userId: string;
  projectId: string | null;
  tagIds: string[];
  description: string;
  notionTaskPageId?: string | null;
  notionTaskTitle?: string | null;
  startedAt: number; // Unix ms timestamp
}

export interface SSEEvent {
  type: "timer:start" | "timer:stop" | "heartbeat" | "data:changed";
  userId?: string;
  channel?: "projects" | "tags" | "team";
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
  sortDate?: string;
  entries?: TimeEntry[];
}
