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
  jsonb,
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
    profilePictureUrl: text("profile_picture_url"),
    // Link to the Notion Team Members DB page — used to resolve memberships and time entry relations
    notionTeamMemberId: text("notion_team_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
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

export const userEmailAliases = pgTable(
  "user_email_aliases",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("user_email_aliases_email_unique").on(t.email),
    index("idx_user_email_aliases_user").on(t.userId),
  ]
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
    /** Canonical FloLabs owner pointer (replaces legacy applicant_id naming). */
    flolabsId: uuid("flolabs_id").references(() => applicants.id, { onDelete: "set null" }),
    /** @deprecated Legacy name kept temporarily for migration compatibility. */
    applicantId: uuid("applicant_id").references(() => applicants.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("tags_name_user_unique").on(t.name, t.userId),
    index("idx_tags_user").on(t.userId),
    index("idx_tags_flolabs").on(t.flolabsId),
    index("idx_tags_applicant").on(t.applicantId),
  ]
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Canonical FloLabs owner pointer (replaces legacy applicant_id naming). */
    flolabsId: uuid("flolabs_id").references(() => applicants.id, { onDelete: "set null" }),
    /** @deprecated Legacy name kept temporarily for migration compatibility. */
    applicantId: uuid("applicant_id").references(() => applicants.id, { onDelete: "set null" }),
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
    index("idx_entries_flolabs").on(t.flolabsId),
    index("idx_entries_applicant").on(t.applicantId),
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

export const entryDiscussions = pgTable(
  'entry_discussions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entryId: uuid('entry_id').notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
    startedById: uuid('started_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Canonical FloLabs starter pointer. */
    startedByFlolabsId: uuid('started_by_flolabs_id').references(() => applicants.id, { onDelete: 'set null' }),
    /** @deprecated Legacy name kept temporarily for migration compatibility. */
    startedByApplicantId: uuid('started_by_applicant_id').references(() => applicants.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Canonical FloLabs resolver pointer. */
    resolvedByFlolabsId: uuid('resolved_by_flolabs_id').references(() => applicants.id, { onDelete: 'set null' }),
    /** @deprecated Legacy name kept temporarily for migration compatibility. */
    resolvedByApplicantId: uuid('resolved_by_applicant_id').references(() => applicants.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_discussions_entry').on(t.entryId),
    index('idx_discussions_started_by').on(t.startedById),
    index('idx_discussions_started_by_flolabs').on(t.startedByFlolabsId),
    index('idx_discussions_resolved_by_flolabs').on(t.resolvedByFlolabsId),
    index('idx_discussions_started_by_applicant').on(t.startedByApplicantId),
    index('idx_discussions_resolved_by_applicant').on(t.resolvedByApplicantId),
    index('idx_discussions_unresolved').on(t.entryId, t.resolvedAt),
  ]
);

export type EntryDiscussionRecord = typeof entryDiscussions.$inferSelect;
export type NewEntryDiscussion = typeof entryDiscussions.$inferInsert;

export const discussionReplies = pgTable(
  'discussion_replies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    discussionId: uuid('discussion_id').notNull().references(() => entryDiscussions.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Canonical FloLabs author pointer. */
    authorFlolabsId: uuid('author_flolabs_id').references(() => applicants.id, { onDelete: 'set null' }),
    /** @deprecated Legacy name kept temporarily for migration compatibility. */
    authorApplicantId: uuid('author_applicant_id').references(() => applicants.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_replies_discussion').on(t.discussionId),
    index('idx_replies_author').on(t.authorId),
    index('idx_replies_author_flolabs').on(t.authorFlolabsId),
    index('idx_replies_author_applicant').on(t.authorApplicantId),
  ]
);

export type DiscussionReplyRecord = typeof discussionReplies.$inferSelect;
export type NewDiscussionReply = typeof discussionReplies.$inferInsert;

export const applicants = pgTable(
  "applicants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    externalApplicantId: text("external_applicant_id"),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    country: text("country"),
    stateRegion: text("state_region"),
    city: text("city"),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender"),
    linkedinUrl: text("linkedin_url"),
    education: text("education"),
    fieldOfStudy: text("field_of_study"),
    currentJobTitle: text("current_job_title"),
    companyName: text("company_name"),
    roleAppliedFor: text("role_applied_for"),
    stage: text("stage").notNull().default("application_submitted"),
    status: text("status").notNull().default("joined"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    lastWebsiteVisit: timestamp("last_website_visit", { withTimezone: true }),
    source: text("source"),
    hubspotRecordId: text("hubspot_record_id"),
    hubspotStatus: text("hubspot_status"),
    hubspotOwner: text("hubspot_owner"),
    hubspotLifecycleStage: text("hubspot_lifecycle_stage"),
    hubspotLeadStatus: text("hubspot_lead_status"),
    hubspotLastModifiedAt: timestamp("hubspot_last_modified_at", { withTimezone: true }),
    hubspotRawData: jsonb("hubspot_raw_data"),
    syncedToTeamMembers: boolean("synced_to_team_members").notNull().default(false),
    /** Canonical Chronos-facing profile + access fields; password stays on `users` until Phase 3. */
    role: text("role").notNull().default("member"),
    teamId: uuid("team_id").references(() => teams.id),
    isActive: boolean("is_active").notNull().default(false),
    weeklyTargetHours: bigint("weekly_target_hours", { mode: "number" }).default(40),
    profilePictureUrl: text("profile_picture_url"),
    notionTeamMemberId: text("notion_team_member_id"),
    chronosUserId: uuid("chronos_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_applicants_stage").on(t.stage),
    index("idx_applicants_status").on(t.status),
    index("idx_applicants_chronos_user_id").on(t.chronosUserId),
  ]
);

export const applicantDuplicateReviews = pgTable(
  "applicant_duplicate_reviews",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    primaryApplicantId: uuid("primary_applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
    duplicateApplicantId: uuid("duplicate_applicant_id").notNull().references(() => applicants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    confidenceScore: bigint("confidence_score", { mode: "number" }).notNull().default(0),
    reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    notes: text("notes"),
    canonicalApplicantId: uuid("canonical_applicant_id").references(() => applicants.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("applicant_duplicate_reviews_pair_unique").on(t.primaryApplicantId, t.duplicateApplicantId),
    index("idx_duplicate_reviews_primary").on(t.primaryApplicantId),
    index("idx_duplicate_reviews_duplicate").on(t.duplicateApplicantId),
    index("idx_duplicate_reviews_status").on(t.status),
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
export type UserEmailAliasRecord = typeof userEmailAliases.$inferSelect;
export type NewUserEmailAlias = typeof userEmailAliases.$inferInsert;
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
export type ApplicantDuplicateReviewRecord = typeof applicantDuplicateReviews.$inferSelect;
export type NewApplicantDuplicateReview = typeof applicantDuplicateReviews.$inferInsert;
