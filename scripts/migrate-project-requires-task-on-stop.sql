ALTER TABLE projects
ADD COLUMN IF NOT EXISTS requires_task_on_stop boolean NOT NULL DEFAULT false;
