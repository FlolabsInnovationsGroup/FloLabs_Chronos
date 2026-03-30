"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Project } from "@/types";

const PROJECT_COLORS = [
  "#366769", "#295a5d", "#755a40", "#684e35",
  "#5c5e6e", "#3d3e4e", "#a73b21", "#791903",
  "#366769", "#b9ecee",
];

function ProjectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Project>;
  onSave: (data: Partial<Project>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#366769");
  const [icon, setIcon] = useState(initial?.icon ?? "folder");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      await onSave({ name, color, icon });
    } catch {
      setError("Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Project Name"
        placeholder="e.g. Website Redesign"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <div className="flex flex-col gap-1.5">
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
              className="w-7 h-7 rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: color === c ? `3px solid ${c}` : "none",
                outlineOffset: "2px",
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer border-0 p-0 bg-transparent"
            title="Custom color"
          />
        </div>
      </div>
      <Input
        label="Icon"
        placeholder="Material icon name (e.g. folder)"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        hint="Use any Material Symbols icon name"
      />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={saving}>
          {initial?.id ? "Save Changes" : "Create Project"}
        </Button>
      </div>
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
                  <div className="w-8 h-8 rounded-lg bg-[#efeee9] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#b2b2ad]" style={{ fontSize: "18px" }}>
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
            />
          )}
        </Modal>
      )}
    </div>
  );
}
