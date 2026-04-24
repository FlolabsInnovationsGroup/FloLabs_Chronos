"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineSearchLoading } from "@/components/ui/InlineSearchLoading";

interface FoundDatabase {
  id: string;
  title: string;
  url?: string | null;
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

export function ControlForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [notionTasksDbId, setNotionTasksDbId] = useState("");
  const [notionTeamMembersDbId, setNotionTeamMembersDbId] = useState("");
  const [timeEntriesDatabaseIdConfigured, setTimeEntriesDatabaseIdConfigured] = useState(false);
  const [notionOnboardingsDbId, setNotionOnboardingsDbId] = useState("");
  const [notionTeamsDbId, setNotionTeamsDbId] = useState("");
  const [notionMasterClassesIndexDbId, setNotionMasterClassesIndexDbId] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [discordCategoryId, setDiscordCategoryId] = useState("");
  const [discordChannelPrefix, setDiscordChannelPrefix] = useState("chronos");
  const [searchQuery, setSearchQuery] = useState("");
  const [databases, setDatabases] = useState<FoundDatabase[]>([]);
  const [apiKeyPresent, setApiKeyPresent] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [discordBotTokenPresent, setDiscordBotTokenPresent] = useState(false);
  const [discordBotTokenMasked, setDiscordBotTokenMasked] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await readJson(await fetch("/api/control", { cache: "no-store" }));
        setApiKeyPresent(Boolean(data.config?.notionApiKeyPresent));
        setApiKeyMasked(data.config?.notionApiKeyMasked ?? "");
        setNotionDatabaseId(data.config?.notionDatabaseId ?? "");
        setNotionTasksDbId(data.config?.notionTasksDbId ?? "");
        setNotionTeamMembersDbId(data.config?.notionTeamMembersDbId ?? "");
        setTimeEntriesDatabaseIdConfigured(Boolean(data.config?.timeEntriesDatabaseIdConfigured));
        setNotionOnboardingsDbId(data.config?.notionOnboardingsDbId ?? "");
        setNotionTeamsDbId(data.config?.notionTeamsDbId ?? "");
        setNotionMasterClassesIndexDbId(data.config?.notionMasterClassesIndexDbId ?? "");
        setDiscordBotTokenPresent(Boolean(data.config?.discordBotTokenPresent));
        setDiscordBotTokenMasked(data.config?.discordBotTokenMasked ?? "");
        setDiscordGuildId(data.config?.discordGuildId ?? "");
        setDiscordCategoryId(data.config?.discordCategoryId ?? "");
        setDiscordChannelPrefix(data.config?.discordChannelPrefix ?? "chronos");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load control settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await readJson(await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionApiKey, notionDatabaseId, notionMasterClassesIndexDbId, discordBotToken, discordGuildId, discordCategoryId, discordChannelPrefix }),
      }));
      setSuccess("Control settings saved.");
      setApiKeyPresent(true);
      setDiscordBotTokenPresent(discordBotTokenPresent || Boolean(discordBotToken.trim()));
      setDiscordBotTokenMasked(discordBotToken ? `${discordBotToken.slice(0, 6)}••••••${discordBotToken.slice(-4)}` : discordBotTokenMasked);
      setApiKeyMasked(notionApiKey ? `${notionApiKey.slice(0, 6)}••••••${notionApiKey.slice(-4)}` : apiKeyMasked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSearch() {
    setSearching(true);
    setError("");
    try {
      const data = await readJson(await fetch(`/api/control/notion-search?q=${encodeURIComponent(searchQuery)}`, { cache: "no-store" }));
      setDatabases(data.databases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notion search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6 flex flex-col gap-6">
      {loading ? (
        <div className="h-40 rounded-xl bg-surface-container-low animate-pulse" />
      ) : (
        <>
          {error && <p className="text-sm text-error bg-warm-surface px-4 py-3 rounded-xl">{error}</p>}
          {success && <p className="text-sm text-primary bg-success-tint px-4 py-3 rounded-xl">{success}</p>}

          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>Notion</h2>
              <Input label="Notion Integration Secret Key" type="password" value={notionApiKey} onChange={(e) => setNotionApiKey(e.target.value)} placeholder={apiKeyPresent ? "Saved in app config — leave empty to keep current key" : "ntn_..."} hint={apiKeyPresent && apiKeyMasked ? `Current key: ${apiKeyMasked}. Enter a new one only if you want to rotate it.` : "Stored in the app config store. Deployment env vars still take precedence if present."} />
              <div className="rounded-xl border border-surface-container bg-surface-container-low px-4 py-3 flex flex-col gap-2">
                <p className="text-sm text-on-background font-medium">Notion database IDs in use</p>
                <p className="text-sm text-on-surface-variant">
                  Tasks and Team Members come from Time Entries relations (<span className="font-medium text-on-background">Task</span>,{" "}
                  <span className="font-medium text-on-background">Team Member</span>). Teams and Onboardings come from Team Members relations (
                  <span className="font-medium text-on-background">Team</span>, <span className="font-medium text-on-background">Onboarding</span>) after the Team Members database is known. Env overrides (when set) take precedence:{" "}
                  <code className="text-xs bg-surface-container px-1.5 py-0.5 rounded">NOTION_TASKS_DB_ID</code>,{" "}
                  <code className="text-xs bg-surface-container px-1.5 py-0.5 rounded">NOTION_TEAM_MEMBERS_DB_ID</code>,{" "}
                  <code className="text-xs bg-surface-container px-1.5 py-0.5 rounded">NOTION_TEAMS_DB_ID</code>,{" "}
                  <code className="text-xs bg-surface-container px-1.5 py-0.5 rounded">NOTION_ONBOARDINGS_DB_ID</code>.
                </p>
                {!timeEntriesDatabaseIdConfigured && (
                  <p className="text-sm text-error">Set NOTION_DATABASE_ID in the deployment environment so the Time Entries schema can be loaded.</p>
                )}
                {timeEntriesDatabaseIdConfigured && (
                  <div className="text-xs font-mono text-on-surface-variant break-all space-y-1">
                    {notionTasksDbId ? <p>Tasks: {notionTasksDbId}</p> : <p className="text-subtle-ink">Tasks: not resolved</p>}
                    {notionTeamMembersDbId ? <p>Team Members: {notionTeamMembersDbId}</p> : <p className="text-subtle-ink">Team Members: not resolved</p>}
                    {notionTeamsDbId ? <p>Teams: {notionTeamsDbId}</p> : <p className="text-subtle-ink">Teams: not resolved</p>}
                    {notionOnboardingsDbId ? <p>Onboardings: {notionOnboardingsDbId}</p> : <p className="text-subtle-ink">Onboardings: not resolved</p>}
                  </div>
                )}
              </div>
              <Input label="Time Entries Database ID" value={notionDatabaseId} onChange={(e) => setNotionDatabaseId(e.target.value)} placeholder="Notion Time Entries database id" hint="Used as the base database to resolve Tasks/Team Members/Teams/Onboardings relations." />
              <Input label="MasterClasses Index Database ID" value={notionMasterClassesIndexDbId} onChange={(e) => setNotionMasterClassesIndexDbId(e.target.value)} placeholder="286a1576955180488db8eb63daccc66c" hint="Database whose rows map teams to the target MasterClass databases." />
            </div>

            <div className="border-t border-surface-container pt-6 flex flex-col gap-4">
              <h2 className="text-lg font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>Discord Bot Provisioning</h2>
              <Input label="Discord Bot Token" type="password" value={discordBotToken} onChange={(e) => setDiscordBotToken(e.target.value)} placeholder={discordBotTokenPresent ? "Saved in app config — leave empty to keep current token" : "Bot token"} hint={discordBotTokenPresent && discordBotTokenMasked ? `Current token: ${discordBotTokenMasked}. Enter a new one only if you want to rotate it.` : "Used to create member channels and webhooks automatically when a user joins."} />
              <Input label="Discord Guild ID" value={discordGuildId} onChange={(e) => setDiscordGuildId(e.target.value)} placeholder="Server / guild ID" />
              <Input label="Discord Category ID" value={discordCategoryId} onChange={(e) => setDiscordCategoryId(e.target.value)} placeholder="Optional category for member channels" />
              <Input label="Channel Prefix" value={discordChannelPrefix} onChange={(e) => setDiscordChannelPrefix(e.target.value)} placeholder="chronos" />
            </div>

            <div className="flex justify-end">
              <Button variant="primary" type="submit" loading={saving}>Save Control Settings</Button>
            </div>
          </form>

          <div className="border-t border-surface-container pt-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>
                Search Notion databases
              </h2>
              <p className="text-sm text-on-surface-variant mt-1" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                Search your workspace to find a database ID when you need to paste the MasterClasses index manually above.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <Input label="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="MasterClasses index database…" />
                <div className="h-4">{searching ? <InlineSearchLoading label="Searching Notion…" /> : null}</div>
              </div>
              <div className="self-end">
                <Button variant="ghost" type="button" onClick={() => void handleSearch()} loading={searching}>Search</Button>
              </div>
            </div>
            {databases.length > 0 && (
              <div className="rounded-xl border border-surface-container overflow-hidden">
                {databases.map((db) => (
                  <div key={db.id} className="px-4 py-3 border-t first:border-t-0 border-surface-container flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-on-background font-medium">{db.title}</p>
                      <p className="text-xs text-subtle-ink break-all">{db.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setNotionMasterClassesIndexDbId(db.id)}>
                        Use for MasterClasses index
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
