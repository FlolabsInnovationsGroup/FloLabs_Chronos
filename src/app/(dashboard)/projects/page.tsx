"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Project } from "@/types";

const PROJECT_COLORS = [
  "#366769", // deep teal
  "#5c5e6e", // slate
  "#a73b21", // warm red
  "#f08a24", // orange
  "#5aa9e6", // sky blue
  "#1f6fa8", // marine blue
  "#6f56d9", // violet
  "#791903", // dark red
];

const MATERIAL_ICONS = [
  "folder", "work", "web", "palette", "campaign", "phone_android", "code", "bolt",
  "design_services", "analytics", "bar_chart", "trending_up", "groups", "handshake",
  "shopping_bag", "payments", "receipt_long", "storefront", "rocket_launch", "school",
  "event", "assignment", "article", "edit_note", "photo_camera", "videocam", "mic",
  "headset", "support_agent", "psychology", "dns", "cloud", "hub", "inventory_2",
  "local_shipping", "medical_services", "restaurant", "fitness_center", "construction",
  "real_estate_agent", "travel", "flight", "hotel", "music_note", "movie", "sports_esports",
];

function ProjectForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Partial<Project>;
  onSave: (data: Partial<Project>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#366769");
  const [icon, setIcon] = useState(initial?.icon ?? "folder");
  const [iconSearch, setIconSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const filteredIcons = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    if (!query) return MATERIAL_ICONS;
    return MATERIAL_ICONS.filter((item) => item.toLowerCase().includes(query));
  }, [iconSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name, color, icon });
    } catch {
      setError("Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch {
      setError("Failed to delete project");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="rounded-2xl bg-[#f5f4ef] p-4 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}22` }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "30px", color }}>
            {icon}
          </span>
        </div>
        <div className="min-w-0">
          <p
            className="text-xs uppercase tracking-wide text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Preview
          </p>
          <p
            className="text-lg italic text-[#31332f] truncate"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {name.trim() || "Your project name"}
          </p>
          <p
            className="text-xs text-[#b2b2ad] mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {icon.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <Input
        label="Project Name"
        placeholder="e.g. Website Redesign"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />

      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-10 h-10 rounded-full transition-transform hover:scale-105 flex items-center justify-center"
              style={{
                backgroundColor: c,
                outline: color === c ? "3px solid rgba(49, 51, 47, 0.25)" : "none",
                outlineOffset: "2px",
              }}
            >
              {color === c && (
                <span className="material-symbols-outlined text-white" style={{ fontSize: "16px" }}>
                  check
                </span>
              )}
            </button>
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-10 rounded-full cursor-pointer border-0 p-0 bg-transparent"
            title="Custom color"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          label="Search Material icon"
          placeholder="Search icons like folder, rocket, chart, palette..."
          value={iconSearch}
          onChange={(e) => setIconSearch(e.target.value)}
        />
        <div className="rounded-2xl bg-[#f5f4ef] p-3 max-h-72 overflow-y-auto">
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {filteredIcons.map((item) => {
              const active = icon === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setIcon(item)}
                  className="group rounded-2xl px-2 py-3 flex flex-col items-center justify-center gap-2 transition-all hover:bg-[#fbf9f5]"
                  style={{
                    backgroundColor: active ? `${color}18` : "transparent",
                    outline: active ? `2px solid ${color}` : "none",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "24px", color: active ? color : "#5e605b" }}>
                    {item}
                  </span>
                  <span
                    className="text-[10px] leading-tight text-center break-words text-[#5e605b]"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {item.replace(/_/g, " ")}
                  </span>
                </button>
              );
            })}
          </div>
          {filteredIcons.length === 0 && (
            <p
              className="text-sm text-[#b2b2ad] text-center py-6"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              No icons found for that search.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          {onDelete && initial?.id && (
            <Button variant="danger" type="button" onClick={() => setConfirmDelete(true)}>
              Delete Project
            </Button>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>
            {initial?.id ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete project" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Delete this project? This will also delete all time entries linked to it. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="primary" type="button" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" type="button" onClick={() => void handleDeleteProject()} loading={deleting}>Delete project</Button>
          </div>
        </div>
      </Modal>
    </form>
  );
}

export default function ProjectsPage() {
  const { data: session } = useSession();
  const canManageProjects = session?.user.role === "admin";
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  async function refreshProjects() {
    const res = await fetch("/api/projects");
    const { projects: data } = await res.json();
    setProjects(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialProjects() {
      try {
        const res = await fetch("/api/projects");
        const { projects: data } = await res.json();
        if (!cancelled) setProjects(data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(data: Partial<Project>) {
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowModal(false);
    await refreshProjects();
  }

  async function handleEdit(data: Partial<Project>) {
    await fetch(`/api/projects/${editProject!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditProject(null);
    await refreshProjects();
  }

  async function handleArchive(project: Project) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    await refreshProjects();
  }

  async function handleDeleteProject(project: Project) {
    await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    setEditProject(null);
    await refreshProjects();
  }

  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-light italic text-[#31332f]"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Projects
          </h1>
          <p
            className="text-sm text-[#5e605b] mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManageProjects && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
            New Project
          </Button>
        )}
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-[#f5f4ef] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : activeProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="material-symbols-outlined text-[#b2b2ad]" style={{ fontSize: "40px" }}>
            folder_open
          </span>
          <p
            className="text-sm text-[#b2b2ad]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            No projects yet. Create one to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeProjects.map((project) => (
            <Card key={project.id} className="p-5 group relative">
              <div className="flex items-start gap-3">
                {/* Color swatch + icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${project.color}20` }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "20px", color: project.color ?? "#366769" }}
                  >
                    {project.icon ?? "folder"}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-[#31332f] truncate"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {project.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: project.color ?? "#366769" }}
                    />
                    <span
                      className="text-xs text-[#b2b2ad] font-mono"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {project.color}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {canManageProjects && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip label="Edit">
                      <button
                        onClick={() => setEditProject(project)}
                        className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] hover:text-[#31332f] transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>
                      </button>
                    </Tooltip>
                    <Tooltip label="Archive">
                      <button
                        onClick={() => handleArchive(project)}
                        className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] hover:text-[#31332f] transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>archive</span>
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Archived section */}
      {archivedProjects.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2
            className="text-sm font-semibold text-[#b2b2ad] uppercase tracking-wide"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Archived ({archivedProjects.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedProjects.map((project) => (
              <Card key={project.id} variant="tonal" className="p-5 opacity-60 group relative">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${project.color ?? "#366769"}18` }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px", color: project.color ?? "#366769" }}
                    >
                      {project.icon ?? "folder"}
                    </span>
                  </div>
                  <p
                    className="text-sm text-[#5e605b] flex-1 truncate"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {project.name}
                  </p>
                  {canManageProjects && (
                    <Tooltip label="Unarchive">
                      <button
                        onClick={() => handleArchive(project)}
                        className="p-1 rounded text-[#5e605b] hover:text-[#31332f] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>unarchive</span>
                      </button>
                    </Tooltip>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {canManageProjects && (
        <Modal open={showModal} onClose={() => setShowModal(false)} title="New Project">
          <ProjectForm onSave={handleCreate} onCancel={() => setShowModal(false)} />
        </Modal>
      )}

      {/* Edit modal */}
      {canManageProjects && (
        <Modal
          open={!!editProject}
          onClose={() => setEditProject(null)}
          title="Edit Project"
        >
          {editProject && (
            <ProjectForm
              initial={editProject}
              onSave={handleEdit}
              onCancel={() => setEditProject(null)}
              onDelete={() => handleDeleteProject(editProject)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
