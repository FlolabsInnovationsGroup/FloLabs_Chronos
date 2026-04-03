"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
  const [notionTasksDbId, setNotionTasksDbId] = useState("");
  const [notionTeamMembersDbId, setNotionTeamMembersDbId] = useState("");
  const [notionTeamsDbId, setNotionTeamsDbId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [databases, setDatabases] = useState<FoundDatabase[]>([]);
  const [apiKeyPresent, setApiKeyPresent] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await readJson(await fetch("/api/control", { cache: "no-store" }));
        setApiKeyPresent(Boolean(data.config?.notionApiKeyPresent));
        setNotionTasksDbId(data.config?.notionTasksDbId ?? "");
        setNotionTeamMembersDbId(data.config?.notionTeamMembersDbId ?? "");
        setNotionTeamsDbId(data.config?.notionTeamsDbId ?? "");
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
        body: JSON.stringify({ notionApiKey, notionTasksDbId, notionTeamMembersDbId, notionTeamsDbId }),
      }));
      setSuccess("Control settings saved.");
      setApiKeyPresent(true);
      if (!notionApiKey) {
        setError("You must provide the Notion integration key when saving from this screen.");
      }
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

  function applyDatabase(id: string, target: "tasks" | "teamMembers" | "teams") {
    if (target === "tasks") setNotionTasksDbId(id);
    if (target === "teamMembers") setNotionTeamMembersDbId(id);
    if (target === "teams") setNotionTeamsDbId(id);
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6 flex flex-col gap-6">
      {loading ? (
        <div className="h-40 rounded-xl bg-[#f5f4ef] animate-pulse" />
      ) : (
        <>
          {error && <p className="text-sm text-[#a73b21] bg-[#fff7f6] px-4 py-3 rounded-xl">{error}</p>}
          {success && <p className="text-sm text-[#366769] bg-[#eef8f6] px-4 py-3 rounded-xl">{success}</p>}

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Input label="Notion Integration Secret Key" type="password" value={notionApiKey} onChange={(e) => setNotionApiKey(e.target.value)} placeholder={apiKeyPresent ? "Saved in app config — enter a new one to replace it" : "ntn_..."} hint="Stored in the app config store. Deployment env vars still take precedence if present." />
            <Input label="Tasks Database ID" value={notionTasksDbId} onChange={(e) => setNotionTasksDbId(e.target.value)} placeholder="b5a15559fffc4a4f97161bf12e6fb400" />
            <Input label="Team Members Database ID" value={notionTeamMembersDbId} onChange={(e) => setNotionTeamMembersDbId(e.target.value)} placeholder="..." />
            <Input label="Teams Database ID" value={notionTeamsDbId} onChange={(e) => setNotionTeamsDbId(e.target.value)} placeholder="..." />
            <div className="flex justify-end">
              <Button variant="primary" type="submit" loading={saving}>Save Control Settings</Button>
            </div>
          </form>

          <div className="border-t border-[#efeee9] pt-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-light italic text-[#31332f]" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>
                Search Notion databases
              </h2>
              <p className="text-sm text-[#5e605b] mt-1" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                Once the integration key is saved, search your connected Notion workspace and apply database IDs directly.
              </p>
            </div>
            <div className="flex gap-3">
              <Input label="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tasks, Team Members, Teams…" />
              <div className="self-end">
                <Button variant="ghost" type="button" onClick={() => void handleSearch()} loading={searching}>Search</Button>
              </div>
            </div>
            {databases.length > 0 && (
              <div className="rounded-xl border border-[#efeee9] overflow-hidden">
                {databases.map((db) => (
                  <div key={db.id} className="px-4 py-3 border-t first:border-t-0 border-[#efeee9] flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#31332f] font-medium">{db.title}</p>
                      <p className="text-xs text-[#8f918b] break-all">{db.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" type="button" onClick={() => applyDatabase(db.id, "tasks")}>Use for Tasks</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => applyDatabase(db.id, "teamMembers")}>Use for Team Members</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => applyDatabase(db.id, "teams")}>Use for Teams</Button>
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
