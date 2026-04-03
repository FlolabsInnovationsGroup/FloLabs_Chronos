# FloLabs Chronos — User Guide

This document explains how to use FloLabs Chronos depending on your role:
- **Member**
- **Team Lead**
- **Admin**

Chronos is FloLabs’ internal time-tracking and coordination tool. It lets you:
- track time
- assign time to projects
- add tags
- link time entries to Notion tasks
- review reports
- manage users and invitations (depending on your role)

---

# 1. What Chronos is for

Chronos is the system of record for:
- who tracked time
- on which project
- for how long
- with which tags
- optionally for which Notion task

Chronos then syncs time entries into Notion and can notify Discord automatically.

---

# 2. Roles and permissions

## Member
Members can:
- start and stop timers
- create manual time entries
- edit their own time entries
- add their own tags
- select a Notion task for their time entries
- see their own reports
- see which teams they belong to
- update their own personal settings

Members cannot:
- create or edit projects
- invite users
- change team structure
- manage other users
- access the Control page

## Team Lead
Team leads can:
- do everything a member can do
- see users across all teams they belong to
- see reports for all accessible users across those teams
- edit weekly target hours where allowed

Team leads cannot:
- create or edit projects
- create invitations
- manage global team structure
- access the Control page unless they are also admins

## Admin
Admins can:
- do everything a member and team lead can do
- create, edit, archive, restore, and delete projects
- create invitations
- disable or delete invitation links
- edit users
- rename users (including other admins)
- change roles and active status
- change team assignments
- access all reports
- access the **Control** page

---

# 3. Main navigation

The left sidebar contains the main areas of Chronos.

## Timer
Use this page to:
- start a live timer
- stop a live timer
- add a description
- assign tags
- assign a Notion task
- review recent entries

## Projects
Use this page to see projects.

Admins can also:
- create projects
- edit projects
- archive projects
- delete projects

## Tags
Use this page to manage your tags.

Tags are:
- personal to each user
- reusable across your own entries
- not shared globally as a managed admin taxonomy

## Users
This page combines:
- teams overview
- users overview
- invitation management

What you see depends on your role.

## Reports
Use Reports to:
- filter entries
- analyze time by day / week / month / user / project
- inspect detailed entries
- export CSV

## Settings
Use Settings to manage your personal account.

## Control
**Admins only**

Use Control to manage integration-level configuration, including:
- Notion integration key
- Notion database IDs
- Discord bot provisioning settings

---

# 4. Tracking time

## Starting a timer
Go to **Timer**.

Before starting, you can choose:
- **Project**
- **Tags**
- **Description**
- **Task** (optional)

Then click **Start Session**.

### Notes
- the timer is based on timestamps, not a ticking server process
- you can edit description, tags, and task while the timer is running
- you must have a description before stopping the timer

## Stopping a timer
When you stop a running timer:
- Chronos calculates the duration
- stores the entry in PostgreSQL
- syncs it to Notion
- may send a Discord notification

---

# 5. Tasks and Notion task linking

Chronos supports **native task selection**.

## How task selection works
When creating or editing an entry, you can search the Notion Tasks database directly.

Chronos will:
- search tasks by title/name
- let you pick the right task
- store the task locally on the time entry
- sync that task to the Notion Time Entries database as a relation

## Task suggestions
Chronos can also suggest likely matches based on your recent work.

Suggestions can carry over:
- description
- project
- tags
- previously used task

## Legacy workaround
There is also an older compatibility path where users can paste a Notion task URL in the description and a local script can link it later.

This is no longer the preferred workflow.

Use the built-in task picker whenever possible.

---

# 6. Editing time entries

You can edit saved entries from the entries list.

## What can be edited
Depending on the entry state, you can update:
- description
- project
- tags
- task
- time boundary (see below)

## One-sided time lock rule
Chronos enforces a rule on saved entries:
- once you edit the **start** time, the **end** time becomes locked
- once you edit the **end** time, the **start** time becomes locked

This prevents over-editing both boundaries of the same entry.

## Edit notifications and sync
When a completed entry is edited:
- Chronos updates the local entry
- syncs the changes to Notion
- sends an edit notification to Discord when possible

If a linked task changes, that change is included in the notification.

---

# 7. Tags

Tags are personal.

That means:
- you create your own tags
- your tag names can overlap with another user’s tag names
- tags are attached to entries through a many-to-many relation

You can:
- create tags
- assign multiple tags to an entry
- remove tags from entries

Deleting a tag does **not** delete the underlying time entries.

---

# 8. Reports

The **Reports** page lets you inspect tracked time.

## Filters
You can filter by:
- date range
- user
- project
- tag
- free-text search

## Grouping
You can group reports by:
- day
- week
- month
- project
- user

## Export
You can export results as CSV.

## Role-based scope
- **Members** see only their own data
- **Team leads** see users in the teams they lead/belong to
- **Admins** see everything

---

# 9. Users page

The **Users** page has two tabs:
- **Teams**
- **Users**

## Teams tab
Shows:
- configured teams
- member counts
- pending invitation counts

## Users tab
Shows:
- people in scope for your role
- roles
- teams
- weekly targets
- status
- join date

Admins can also:
- edit a member
- rename a member
- change roles
- change team assignments
- activate/deactivate accounts
- delete users if they have no time entries

---

# 10. Invitations

Invitations are managed by admins from the **Users** page.

## Creating an invitation
When creating an invitation, admins can set:
- full name
- email
- role
- one or more teams
- expiration date/time

Chronos then:
- creates an invitation token
- stores team assignments locally
- generates an invitation link
- ensures a corresponding Team Member page exists in Notion

## Important Team Member behavior
If the invited person does **not** already have a Team Member page in Notion:
- Chronos creates one
- populates the invited teams in the `Team` relation
- sets `Status = Onboarding`

If the selected teams are not properly linked to Notion team pages, Chronos now fails explicitly rather than creating an incomplete Team Member record.

## Editing invitation expiry
Admins can:
- set the expiration date when creating the invite
- later edit the expiration date from the invitation list
- disable an invite immediately
- delete an invitation link entirely

---

# 11. Team Members Notion database behavior

Chronos integrates with the Notion **Team Members** database.

## On invitation creation
If no matching Team Member page exists for the invited email:
- Chronos creates one
- populates:
  - `Name`
  - `Email`
  - `Team` relation(s)
  - `Status = Onboarding`

## On user registration
When the person accepts the invite and registers:
- Chronos creates the user locally
- creates their team memberships locally
- can provision Discord resources automatically if configured

## On user rename
When an admin renames a user in Chronos:
- Chronos updates the corresponding Team Member page name in Notion
- it first tries the stored `notionTeamMemberId`
- if that is missing, it falls back to looking up the Team Member page by email

---

# 12. Discord notifications

Chronos can notify Discord about time entries.

## What gets sent
Chronos can send branded Discord embeds for:
- new time entries
- edited time entries
- deleted time entries

Notifications can include:
- user
- project
- task
- description
- tags
- duration
- timestamps
- edit changes

## If a webhook is missing
If the webhook relation is not available yet:
- the entry still syncs to Notion
- it remains/gets marked as **Processed** in Notion
- it is treated as queued for notification later

## Automatic channel provisioning
If Discord bot provisioning is configured in **Control**:
- when a user joins Chronos through registration
- Chronos can create a Discord channel for them automatically
- create or reuse a webhook in that channel
- store that webhook for future notifications

---

# 13. Control page (admins only)

The **Control** page is for system-level integration management.

## Notion section
Admins can configure:
- Notion integration secret key
- Tasks database ID
- Team Members database ID
- Teams database ID

Chronos can also search the connected Notion workspace for databases and help apply their IDs.

## Discord bot provisioning section
Admins can configure:
- Discord bot token
- Discord guild/server ID
- Discord category ID
- channel prefix

This allows Chronos to provision member channels/webhooks automatically when users join.

## Security note
Secrets entered on the Control page are stored in Chronos’ app config store.

If deployment environment variables also exist, they may still take precedence depending on the integration path.

---

# 14. Projects (admins)

Admins manage projects from the **Projects** page.

They can:
- create new projects
- choose icon and color
- edit projects
- archive projects
- delete projects

All users can select active projects when tracking time.

Deleting a project also deletes linked time entries, so it should be used carefully.

---

# 15. Settings

Each user can access **Settings** to manage their own account details.

This is personal account configuration, separate from admin controls.

---

# 16. Common workflows

## Member workflow
1. Open **Timer**
2. Choose project
3. Add description
4. Add tags if useful
5. Optionally select a Notion task
6. Start session
7. Stop when done
8. Review recent entry
9. Edit if needed

## Team lead workflow
1. Track your own work as normal
2. Open **Reports** to review your teams’ activity
3. Open **Users** to review who is active and on which teams
4. Adjust weekly targets where allowed

## Admin workflow
1. Create and maintain projects
2. Invite new users and assign teams
3. Edit invitation expiration when needed
4. Keep Team Members / Teams integrations healthy
5. Use **Control** to manage Notion and Discord integration config
6. Review reports and user setup globally

---

# 17. Troubleshooting

## I can’t see a page in the sidebar
Your role may not allow access.

Examples:
- Members do not see **Control**
- Only admins can manage invitations and projects fully

## I can’t stop a timer
Make sure the running timer has a description.

## My task isn’t linking to Notion
Use the built-in task picker.
If the issue persists, ask an admin to verify the Notion integration settings in **Control**.

## A Discord notification didn’t arrive
Possible reasons:
- no webhook available yet
- Discord bot/webhook configuration is missing
- the entry is still queued in Notion as **Processed**

## Invitation creation fails for Team Members sync
This usually means one or more selected teams are not properly linked to Notion team pages yet.

---

# 18. Summary

Chronos is built to be used daily by members, reviewed by team leads, and operated by admins.

The shortest mental model is:
- **Members** track work
- **Team leads** monitor team activity
- **Admins** manage projects, invitations, and integrations

If you’re ever unsure where to start, start with:
- **Timer** for tracking work
- **Users** for managing people
- **Reports** for reviewing output
- **Control** for integrations (admins only)
