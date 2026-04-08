"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useEffect, useRef } from "react";
import type { Project, Tag, User } from "@/types";
import { DropdownSelect } from "@/components/ui/DropdownSelect";

const PAGE_SIZE_OPTIONS = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "250", label: "250" },
  { value: "500", label: "500" },
  { value: "all", label: "All" },
];

interface ReportFiltersProps {
  projects: Project[];
  tags: Tag[];
  users?: User[];
}

export function ReportFilters({ projects, tags, users = [] }: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const get = (key: string) => searchParams.get(key) ?? "";

  // Local state for search with 2-second debounce
  const [searchInput, setSearchInput] = useState(get("search"));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local search state when URL param changes externally (e.g. clear filters)
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update("search", value);
    }, 2000);
  }

  return (
    <div className="flex flex-wrap items-start gap-3 p-4 bg-surface-container-lowest rounded-xl paper-shadow">
      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs text-on-surface-variant font-medium whitespace-nowrap"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          From
        </span>
        <input
          type="date"
          value={get("from")}
          onChange={(e) => update("from", e.target.value)}
          className="px-2.5 py-1.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
        <span
          className="text-xs text-on-surface-variant font-medium"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          to
        </span>
        <input
          type="date"
          value={get("to")}
          onChange={(e) => update("to", e.target.value)}
          className="px-2.5 py-1.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-6 bg-surface-container" />

      {/* User select (admin / team lead) */}
      {users.length > 0 && (
        <DropdownSelect
          value={get("userId")}
          onChange={(v) => update("userId", v)}
          options={[
            { value: "", label: "All members" },
            ...users.map((u) => ({ value: u.id, label: u.name })),
          ]}
          placeholder="All members"
          className="w-full sm:w-40"
          searchable
        />
      )}

      {/* Project select */}
      <DropdownSelect
        value={get("projectId")}
        onChange={(v) => update("projectId", v)}
        options={[
          { value: "", label: "All projects" },
          ...projects.map((p) => ({ value: p.id, label: p.name, color: p.color ?? undefined })),
        ]}
        placeholder="All projects"
        className="w-full sm:w-40"
        searchable
      />

      {/* Tag select */}
      <DropdownSelect
        value={get("tagId")}
        onChange={(v) => update("tagId", v)}
        options={[
          { value: "", label: "All tags" },
          ...tags.map((t) => ({ value: t.id, label: t.name })),
        ]}
        placeholder="All tags"
        className="w-full sm:w-36"
        searchable
      />

      {/* Group by */}
      <DropdownSelect
        value={get("groupBy") || "day"}
        onChange={(v) => update("groupBy", v)}
        options={[
          { value: "day", label: "By Day" },
          { value: "week", label: "By Week" },
          { value: "month", label: "By Month" },
          { value: "project", label: "By Project" },
          { value: "user", label: "By Member" },
        ]}
        placeholder="Group by"
        className="w-full sm:w-36"
      />

      {/* Page size */}
      <DropdownSelect
        value={get("limit") || "50"}
        onChange={(v) => update("limit", v === "50" ? "" : v)}
        options={PAGE_SIZE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} / page` }))}
        placeholder="50 / page"
        className="w-full sm:w-32"
      />

      {/* Search (debounced 2s) */}
      <div className="flex-1 min-w-[160px] relative">
        <span
          className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline-variant"
          style={{ fontSize: "16px" }}
        >
          search
        </span>
        <input
          type="text"
          placeholder="Search entries..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-outline-variant"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
      </div>

      {/* Clear filters */}
      {Array.from(searchParams.keys()).length > 0 && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs text-error hover:underline px-1"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
