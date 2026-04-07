import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    notionPageId: text("notion_page_id"),
    generalWebhookUrl: text("general_webhook_url"),
    meetingsWebhookUrl: text("meetings_webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_slug_unique").on(t.slug),
    uniqueIndex("teams_notion_page_id_unique").on(t.notionPageId),
  ]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").unique().notNull(),
    name: text("name").notNull(),
    password: text("password").notNull(),
    role: text("role").notNull().default("member"),
    teamId: uuid("team_id").references(() => teams.id),
    isActive: boolean("is_active").notNull().default(true),
    // Discord integration
    discordWebhookUrl: text("discord_webhook_url"),
    notifyOnStart: boolean("notify_on_start").default(false),
    notifyOnStop: boolean("notify_on_stop").default(false),
    dailySummary: boolean("daily_summary").default(false),
    weeklyTargetHours: bigint("weekly_target_hours", { mode: "number" }).default(40),
    // Link to the Notion Team Members DB page — used to resolve memberships and time entry relations
    notionTeamMemberId: text("notion_team_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_users_team").on(t.teamId)]
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.teamId] }),
    index("idx_team_memberships_user").on(t.userId),
    index("idx_team_memberships_team").on(t.teamId),
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_tokens_token_unique").on(t.token)]
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("member"),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    token: text("token").notNull(),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    notionTeamMemberId: text("notion_team_member_id"),
  },
  (t) => [
    uniqueIndex("invitations_token_unique").on(t.token),
    index("idx_invitations_email").on(t.email),
    index("idx_invitations_team").on(t.teamId),
  ]
);

export const invitationTeamMemberships = pgTable(
  "invitation_team_memberships",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.teamId] }),
    index("idx_invitation_team_memberships_invitation").on(t.invitationId),
    index("idx_invitation_team_memberships_team").on(t.teamId),
  ]
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").default("#366769"),
  icon: text("icon").default("folder"),
  requiresTaskOnStop: boolean("requires_task_on_stop").notNull().default(false),
  archived: boolean("archived").default(false),
  /** Admin who created the project (only admins can create projects). */
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Tags are per-user; unique per (name, userId).
// ON DELETE CASCADE on userId means deleting a user also deletes their tags.
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("tags_name_user_unique").on(t.name, t.userId),
    index("idx_tags_user").on(t.userId),
  ]
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id").references(() => projects.id),
    description: text("description").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    // Tracks which extreme was edited (start or end). Once set, the other is locked.
    editedField: text("edited_field"),
    // Notion backup integration
    notionPageId: text("notion_page_id"),
    notionTaskPageId: text("notion_task_page_id"),
    notionTaskTitle: text("notion_task_title"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_entries_user").on(t.userId, t.startedAt),
    index("idx_entries_project").on(t.projectId, t.startedAt),
    index("idx_entries_date").on(t.startedAt),
  ]
);

// Many-to-many join table between time entries and tags.
// Both FKs cascade on delete so rows are cleaned up automatically.
export const timeEntryTags = pgTable(
  "time_entry_tags",
  {
    timeEntryId: uuid("time_entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.timeEntryId, t.tagId] }),
    index("idx_entry_tags_entry").on(t.timeEntryId),
    index("idx_entry_tags_tag").on(t.tagId),
  ]
);

export const appConfig = pgTable(
  "app_config",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    isSecret: boolean("is_secret").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_app_config_updated_at").on(t.updatedAt)]
);

export type UserRecord = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TeamRecord = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMembershipRecord = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;
export type InvitationRecord = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type InvitationTeamMembershipRecord = typeof invitationTeamMemberships.$inferSelect;
export type NewInvitationTeamMembership = typeof invitationTeamMemberships.$inferInsert;
export type ProjectRecord = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type TagRecord = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TimeEntryRecord = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type TimeEntryTagRecord = typeof timeEntryTags.$inferSelect;
