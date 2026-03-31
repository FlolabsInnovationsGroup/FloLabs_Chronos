"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useSSE } from "@/hooks/use-sse";
import type { SSEEvent } from "@/types";

interface TagRow {
  id: string;
  name: string;
  userId: string;
  createdAt?: string;
  user?: { id: string; name: string } | null;
}

const PAGE_SIZE = 100;

export default function TagsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "admin";

  const [tagList, setTagList] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const [editTag, setEditTag] = useState<TagRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const refreshTags = useCallback(async () => {
    const res = await fetch("/api/tags", { cache: "no-store" });
    const { tags: data } = await res.json();
    setTagList(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tags", { cache: "no-store" });
        const { tags: data } = await res.json();
        if (!cancelled) setTagList(data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (event.type === "data:changed" && event.channel === "tags") {
          void refreshTags();
        }
      },
      [refreshTags]
    )
  );

  const paginated = tagList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(tagList.length / PAGE_SIZE));
  const allPageSelected = paginated.length > 0 && paginated.every((t) => selected.has(t.id));

  function toggleAll() {
    if (allPageSelected) {
      const next = new Set(selected);
      paginated.forEach((t) => next.delete(t.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      paginated.forEach((t) => next.add(t.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error ?? "Failed to create tag");
        return;
      }
      setCreateName("");
      setShowCreate(false);
      await refreshTags();
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTag) return;
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/tags/${editTag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error ?? "Failed to save");
        return;
      }
      setEditTag(null);
      await refreshTags();
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteSingle() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await fetch(`/api/tags/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(deleteTarget.id);
        return n;
      });
      await refreshTags();
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      const ids = Array.from(selected).join(",");
      await fetch(`/api/tags?ids=${ids}`, { method: "DELETE" });
      setSelected(new Set());
      setBulkDeleteOpen(false);
      await refreshTags();
    } finally {
      setBulkDeleteLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light italic text-[#31332f]" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>
            Tags
          </h1>
          <p className="text-sm text-[#5e605b] mt-0.5" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            {tagList.length} tag{tagList.length !== 1 ? "s" : ""}
            {isAdmin ? " (all users)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              Delete {selected.size} selected
            </Button>
          )}
          <Button variant="primary" onClick={() => { setCreateName(""); setCreateError(""); setShowCreate(true); }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
            New Tag
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-11 bg-[#f5f4ef] rounded-xl animate-pulse" />)}
        </div>
      ) : tagList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="material-symbols-outlined text-[#b2b2ad]" style={{ fontSize: "40px" }}>label_off</span>
          <p className="text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            No tags yet. Create one to start labelling entries.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-[#efeee9]">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#f5f4ef] border-b border-[#efeee9]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="w-4 h-4 rounded accent-[#366769] shrink-0" aria-label="Select all on this page" />
              <span className="text-xs font-semibold text-[#5e605b] uppercase tracking-wide flex-1">Name</span>
              {isAdmin && <span className="text-xs font-semibold text-[#5e605b] uppercase tracking-wide w-36 shrink-0">Owner</span>}
              <span className="w-16 shrink-0" />
            </div>

            {paginated.map((tag, idx) => (
              <div key={tag.id} className={`flex items-center gap-3 px-4 py-3 ${idx < paginated.length - 1 ? "border-b border-[#efeee9]" : ""} hover:bg-[#f5f4ef] transition-colors group`}>
                <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggleOne(tag.id)} className="w-4 h-4 rounded accent-[#366769] shrink-0" aria-label={`Select ${tag.name}`} />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#5e605b]" style={{ fontSize: "16px" }}>label</span>
                  <span className="text-sm text-[#31332f] truncate" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{tag.name}</span>
                </div>
                {isAdmin && <span className="text-xs text-[#5e605b] w-36 shrink-0 truncate" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{tag.user?.name ?? "—"}</span>}
                <div className="w-16 shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditTag(tag); setEditName(tag.name); setEditError(""); }} className="p-1 rounded-lg text-[#5e605b] hover:bg-[#e9e8e3] transition-colors" aria-label={`Rename ${tag.name}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>edit</span>
                  </button>
                  <button onClick={() => setDeleteTarget(tag)} className="p-1 rounded-lg text-[#a73b21] hover:bg-[#fde0d9] transition-colors" aria-label={`Delete ${tag.name}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tagList.length)} of {tagList.length}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg bg-[#f5f4ef] hover:bg-[#e9e8e3] disabled:opacity-40 transition-colors">Previous</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg bg-[#f5f4ef] hover:bg-[#e9e8e3] disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Tag" size="sm">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input label="Tag Name" placeholder="e.g. Deep Work" value={createName} onChange={(e) => setCreateName(e.target.value)} error={createError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={createLoading}>Create Tag</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTag} onClose={() => setEditTag(null)} title="Rename Tag" size="sm">
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          <Input label="Tag Name" value={editName} onChange={(e) => setEditName(e.target.value)} error={editError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setEditTag(null)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={editLoading}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete tag" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Delete &ldquo;{deleteTarget?.name}&rdquo;? Time entries will keep their data but lose this tag association. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="primary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" type="button" loading={deleteLoading} onClick={handleDeleteSingle}>Delete</Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} title="Delete tags" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Delete {selected.size} tag{selected.size !== 1 ? "s" : ""}? Time entries will keep their data but lose these tag associations. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="primary" type="button" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" type="button" loading={bulkDeleteLoading} onClick={handleBulkDelete}>Delete {selected.size}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
