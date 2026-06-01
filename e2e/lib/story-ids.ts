/**
 * Notion page IDs for each QA story in "FloLabs Chronos reports" database.
 * These are used by test suites to report pass/fail back to Notion after running.
 * Database: https://www.notion.so/flolabsrd/337a1576955180679d20d7412c064129
 */
export const STORIES = {
  // Timer lifecycle
  START_TIMER:            "372a1576-9551-8124-a3b0-d78f127e19b6",
  SET_FIELDS_WHILE_RUNNING: "372a1576-9551-819d-bba1-c1f347483748",
  ACTIVE_PROJECT_WIDGET:  "372a1576-9551-81ed-939c-dc1eeda61a55",
  STOP_DATA_RETENTION:    "372a1576-9551-81e1-83de-c06b06642647",
  TOPBAR_PERSISTENCE:     "372a1576-9551-81cc-8ae9-fa33d0e59556",

  // Entry management
  ENTRY_EDIT:             "372a1576-9551-8132-842f-eb216cb62571",
  DISCORD_NON_FATAL:      "372a1576-9551-81d8-96d4-f5e291df6318",
  ENTRY_DELETE:           "372a1576-9551-8179-97a5-ce9cb0a5808d",
  RESTART_FROM_ENTRY:     "372a1576-9551-814c-94f5-ed87f398b7f1",
  ONE_BOUNDARY_RULE:      "372a1576-9551-816d-af33-e6c4a06cfddf",

  // Pages / features
  REPORTS:                "372a1576-9551-8182-91ef-ce28b4f30eb3",
  NAV_SMOKE:              "372a1576-9551-8182-aef9-c914cec296f3",
  TAGS:                   "372a1576-9551-81ae-8535-c316d47b923a",
  PROJECTS:               "372a1576-9551-8179-aae7-db35f358d536",
  USERS_PAGE:             "372a1576-9551-81d8-a087-eb90c268da80",
  TEAMS_PAGE:             "372a1576-9551-818b-9f58-cb7d46fc8fe1",
  TASK_SEARCH:            "372a1576-9551-8117-9a0e-d1e342fa4ba6",
  SETTINGS:               "372a1576-9551-8124-aac1-cffb88a5d502",
  AUTH:                   "372a1576-9551-81b7-a30a-d8b596073bdc",
  CONTROL_PAGE:           "372a1576-9551-8163-ba28-d63d72e17e9b",

  // Infrastructure
  TIMER_JSON_GUARD:       "372a1576-9551-818b-aba5-dd58dc010e96",
  SSE_RECONNECT:          "372a1576-9551-814a-b447-c826728b062b",
  NOTION_SYNC:            "372a1576-9551-818f-8e45-ea27ddb3241d",
  WEEKLY_MOMENTUM:        "372a1576-9551-81c3-b28c-ebabb22208d1",
} as const;
