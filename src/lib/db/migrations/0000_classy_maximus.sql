CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "applicant_duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_applicant_id" uuid NOT NULL,
	"duplicate_applicant_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confidence_score" bigint DEFAULT 0 NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"canonical_applicant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "applicants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_applicant_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"country" text,
	"state_region" text,
	"city" text,
	"date_of_birth" text,
	"gender" text,
	"linkedin_url" text,
	"education" text,
	"field_of_study" text,
	"current_job_title" text,
	"company_name" text,
	"role_applied_for" text,
	"stage" text DEFAULT 'application_submitted' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	"last_website_visit" timestamp with time zone,
	"source" text,
	"hubspot_record_id" text,
	"hubspot_status" text,
	"hubspot_owner" text,
	"hubspot_lifecycle_stage" text,
	"hubspot_lead_status" text,
	"hubspot_last_modified_at" timestamp with time zone,
	"hubspot_raw_data" jsonb,
	"synced_to_team_members" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" uuid,
	"is_active" boolean DEFAULT false NOT NULL,
	"weekly_target_hours" bigint DEFAULT 40,
	"profile_picture_url" text,
	"notion_team_member_id" text,
	"chronos_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "applicants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "discussion_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discussion_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entry_discussions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"started_by_id" uuid NOT NULL,
	"message" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invitation_team_memberships" (
	"invitation_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "invitation_team_memberships_invitation_id_team_id_pk" PRIMARY KEY("invitation_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" uuid NOT NULL,
	"token" text NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"notion_team_member_id" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#366769',
	"icon" text DEFAULT 'folder',
	"requires_task_on_stop" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "team_memberships_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notion_page_id" text,
	"general_webhook_url" text,
	"meetings_webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"description" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"duration_ms" bigint,
	"edited_field" text,
	"notion_page_id" text,
	"notion_task_page_id" text,
	"notion_task_title" text,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_entry_tags" (
	"time_entry_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "time_entry_tags_time_entry_id_tag_id_pk" PRIMARY KEY("time_entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_email_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"discord_webhook_url" text,
	"notify_on_start" boolean DEFAULT false,
	"notify_on_stop" boolean DEFAULT false,
	"daily_summary" boolean DEFAULT false,
	"weekly_target_hours" bigint DEFAULT 40,
	"profile_picture_url" text,
	"notion_team_member_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_duplicate_reviews" ADD CONSTRAINT "applicant_duplicate_reviews_primary_applicant_id_applicants_id_fk" FOREIGN KEY ("primary_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_duplicate_reviews" ADD CONSTRAINT "applicant_duplicate_reviews_duplicate_applicant_id_applicants_id_fk" FOREIGN KEY ("duplicate_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_duplicate_reviews" ADD CONSTRAINT "applicant_duplicate_reviews_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_duplicate_reviews" ADD CONSTRAINT "applicant_duplicate_reviews_canonical_applicant_id_applicants_id_fk" FOREIGN KEY ("canonical_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_chronos_user_id_users_id_fk" FOREIGN KEY ("chronos_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_discussion_id_entry_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."entry_discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_team_memberships" ADD CONSTRAINT "invitation_team_memberships_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_team_memberships" ADD CONSTRAINT "invitation_team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_aliases" ADD CONSTRAINT "user_email_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_app_config_updated_at" ON "app_config" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_duplicate_reviews_pair_unique" ON "applicant_duplicate_reviews" USING btree ("primary_applicant_id","duplicate_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_duplicate_reviews_primary" ON "applicant_duplicate_reviews" USING btree ("primary_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_duplicate_reviews_duplicate" ON "applicant_duplicate_reviews" USING btree ("duplicate_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_duplicate_reviews_status" ON "applicant_duplicate_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_applicants_stage" ON "applicants" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_applicants_status" ON "applicants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_applicants_chronos_user_id" ON "applicants" USING btree ("chronos_user_id");--> statement-breakpoint
CREATE INDEX "idx_replies_discussion" ON "discussion_replies" USING btree ("discussion_id");--> statement-breakpoint
CREATE INDEX "idx_replies_author" ON "discussion_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_entry" ON "entry_discussions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_started_by" ON "entry_discussions" USING btree ("started_by_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_unresolved" ON "entry_discussions" USING btree ("entry_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_invitation_team_memberships_invitation" ON "invitation_team_memberships" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_team_memberships_team" ON "invitation_team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitations_team" ON "invitations" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_unique" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_user_unique" ON "tags" USING btree ("name","user_id");--> statement-breakpoint
CREATE INDEX "idx_tags_user" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_user" ON "team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_team" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_unique" ON "teams" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_notion_page_id_unique" ON "teams" USING btree ("notion_page_id");--> statement-breakpoint
CREATE INDEX "idx_entries_user" ON "time_entries" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_entries_project" ON "time_entries" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_entries_date" ON "time_entries" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_entry_tags_entry" ON "time_entry_tags" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "idx_entry_tags_tag" ON "time_entry_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_aliases_email_unique" ON "user_email_aliases" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_email_aliases_user" ON "user_email_aliases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_team" ON "users" USING btree ("team_id");