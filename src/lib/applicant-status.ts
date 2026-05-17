/**
 * Canonical applicant pipeline status on shared `flolabs_users.status`.
 * Must stay aligned with hephaestus-international `ApplicantStatus`.
 */
export const APPLICANT_STATUS_VALUES = [
  "applying",
  "waiting",
  "approved",
  "rejected",
  "signed",
  "joined",
  "graduated",
  "terminated",
] as const;

export type ApplicantStatus = (typeof APPLICANT_STATUS_VALUES)[number];

const LABELS: Record<ApplicantStatus, string> = {
  applying: "Applying",
  waiting: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  signed: "Signed",
  joined: "Joined",
  graduated: "Graduated",
  terminated: "Terminated",
};

export function normalizeApplicantStatus(raw: string | null | undefined): ApplicantStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if ((APPLICANT_STATUS_VALUES as readonly string[]).includes(value)) {
    return value as ApplicantStatus;
  }
  return null;
}

export function formatApplicantStatusLabel(raw: string | null | undefined): string {
  const normalized = normalizeApplicantStatus(raw);
  if (normalized) return LABELS[normalized];
  const trimmed = String(raw ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "—";
}

/** Graduated and terminated users must not sign in to Chronos. */
export function chronosAccessDisabled(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "graduated" || value === "terminated";
}

import { userVisibleMatchingHephaestusJoinedDirectory } from "@/lib/hephaestus-directory-parity";

export function userVisibleOnChronosDirectory(input: {
  status: string | null | undefined;
  role: string;
  notionTeamMemberId: string | null | undefined;
  email?: string | null | undefined;
  isMergedDuplicate?: boolean;
}): boolean {
  void input.role;
  void input.notionTeamMemberId;
  return userVisibleMatchingHephaestusJoinedDirectory({
    status: input.status,
    email: input.email,
    isMergedDuplicate: input.isMergedDuplicate,
  });
}

export const APPLICANT_STATUS_SELECT_OPTIONS = APPLICANT_STATUS_VALUES.map((value) => ({
  value,
  label: LABELS[value],
}));
