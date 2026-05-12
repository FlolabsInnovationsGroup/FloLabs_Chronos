ALTER TABLE "applicants" ALTER COLUMN "status" SET DEFAULT 'joined';--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD COLUMN "author_flolabs_id" uuid;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD COLUMN "author_applicant_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD COLUMN "started_by_flolabs_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD COLUMN "started_by_applicant_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD COLUMN "resolved_by_flolabs_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD COLUMN "resolved_by_applicant_id" uuid;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "flolabs_id" uuid;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "applicant_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "flolabs_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "applicant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_author_flolabs_id_applicants_id_fk" FOREIGN KEY ("author_flolabs_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_author_applicant_id_applicants_id_fk" FOREIGN KEY ("author_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_started_by_flolabs_id_applicants_id_fk" FOREIGN KEY ("started_by_flolabs_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_started_by_applicant_id_applicants_id_fk" FOREIGN KEY ("started_by_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_resolved_by_flolabs_id_applicants_id_fk" FOREIGN KEY ("resolved_by_flolabs_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_discussions" ADD CONSTRAINT "entry_discussions_resolved_by_applicant_id_applicants_id_fk" FOREIGN KEY ("resolved_by_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_flolabs_id_applicants_id_fk" FOREIGN KEY ("flolabs_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_flolabs_id_applicants_id_fk" FOREIGN KEY ("flolabs_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_replies_author_flolabs" ON "discussion_replies" USING btree ("author_flolabs_id");--> statement-breakpoint
CREATE INDEX "idx_replies_author_applicant" ON "discussion_replies" USING btree ("author_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_started_by_flolabs" ON "entry_discussions" USING btree ("started_by_flolabs_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_resolved_by_flolabs" ON "entry_discussions" USING btree ("resolved_by_flolabs_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_started_by_applicant" ON "entry_discussions" USING btree ("started_by_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_resolved_by_applicant" ON "entry_discussions" USING btree ("resolved_by_applicant_id");--> statement-breakpoint
CREATE INDEX "idx_tags_flolabs" ON "tags" USING btree ("flolabs_id");--> statement-breakpoint
CREATE INDEX "idx_tags_applicant" ON "tags" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "idx_entries_flolabs" ON "time_entries" USING btree ("flolabs_id");--> statement-breakpoint
CREATE INDEX "idx_entries_applicant" ON "time_entries" USING btree ("applicant_id");