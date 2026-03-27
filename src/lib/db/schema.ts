import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("member"),
  // Discord integration
  discordWebhookUrl: text("discord_webhook_url"),
  notifyOnStart: boolean("notify_on_start").default(false),
  notifyOnStop: boolean("notify_on_stop").default(false),
  dailySummary: boolean("daily_summary").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").default("#366769"),
  icon: text("icon").default("folder"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").unique().notNull(),
  color: text("color").default("#755a40"),
});

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    tagId: uuid("tag_id").references(() => tags.id),
    description: text("description").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    // Notion backup integration
    notionPageId: text("notion_page_id"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_entries_user").on(t.userId, t.startedAt),
    index("idx_entries_project").on(t.projectId, t.startedAt),
    index("idx_entries_date").on(t.startedAt),
    index("idx_entries_tag").on(t.tagId),
  ]
);

export type UserRecord = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ProjectRecord = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type TagRecord = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TimeEntryRecord = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
