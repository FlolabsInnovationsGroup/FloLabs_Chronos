"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { Project, Tag, User } from "@/types";

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

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl paper-shadow">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-[#5e605b] font-medium whitespace-nowrap"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          From
        </span>
        <input
          type="date"
          value={get("from")}
          onChange={(e) => update("from", e.target.value)}
          className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
        <span
          className="text-xs text-[#5e605b] font-medium"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          to
        </span>
        <input
          type="date"
          value={get("to")}
          onChange={(e) => update("to", e.target.value)}
          className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#efeee9]" />

      {/* User select (admin) */}
      {users.length > 0 && (
        <select
          value={get("userId")}
          onChange={(e) => update("userId", e.target.value)}
          className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 cursor-pointer"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          <option value="">All members</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      {/* Project select */}
      <select
        value={get("projectId")}
        onChange={(e) => update("projectId", e.target.value)}
        className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 cursor-pointer"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Tag select */}
      <select
        value={get("tagId")}
        onChange={(e) => update("tagId", e.target.value)}
        className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 cursor-pointer"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Group by */}
      <select
        value={get("groupBy") || "day"}
        onChange={(e) => update("groupBy", e.target.value)}
        className="px-2.5 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 cursor-pointer"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        <option value="day">By Day</option>
        <option value="week">By Week</option>
        <option value="month">By Month</option>
        <option value="project">By Project</option>
        <option value="user">By Member</option>
      </select>

      {/* Search */}
      <div className="flex-1 min-w-[160px] relative">
        <span
          className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#b2b2ad]"
          style={{ fontSize: "16px" }}
        >
          search
        </span>
        <input
          type="text"
          placeholder="Search entries..."
          value={get("search")}
          onChange={(e) => update("search", e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 placeholder:text-[#b2b2ad]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
      </div>

      {/* Clear filters */}
      {Array.from(searchParams.keys()).length > 0 && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs text-[#a73b21] hover:underline px-1"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
