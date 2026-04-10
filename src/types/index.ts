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
  activeTimer?: {
    startedAt: number;
    description: string;
    projectId: string | null;
    projectName?: string | null;
    notionTaskPageId?: string | null;
    notionTaskTitle?: string | null;
  } | null;
  /** Linked Notion Team Members database row (set at invite acceptance or by admin). */
  notionTeamMemberId?: string | null;
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
  notionTeamMemberId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  requiresTaskOnStop: boolean;
  archived: boolean;
  createdById?: string | null;
  /** Present when loaded from API with creator join (Projects list). */
  createdBy?: { id: string; name: string } | null;
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
  /** Denormalized for Redis / SSE; resolved from DB when project changes. */
  projectName?: string | null;
  projectRequiresTaskOnStop?: boolean;
  tagIds: string[];
  description: string;
  notionTaskPageId?: string | null;
  notionTaskTitle?: string | null;
  startedAt: number; // Unix ms timestamp
}

export interface DiscussionReply {
  id: string;
  discussionId: string;
  authorId: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
  author?: Pick<User, 'id' | 'name'>;
}

export interface EntryDiscussion {
  id: string;
  entryId: string;
  startedById: string;
  message: string;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedBy?: Pick<User, 'id' | 'name'>;
  resolvedBy?: Pick<User, 'id' | 'name'> | null;
  entryOwnerUserId?: string;
  entryDescription?: string;
  entryProjectName?: string;
  replies?: DiscussionReply[];
}

export interface SSEEvent {
  type: "timer:start" | "timer:stop" | "heartbeat" | "data:changed" | "discussion:new" | "discussion:resolved";
  userId?: string;
  channel?: "projects" | "tags" | "team" | "discussions";
  entryId?: string;
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
