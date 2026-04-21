import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/invitations";
import { findApplicantForCredentialEmail } from "@/lib/applicant-auth";
import { findUserByAnyEmail } from "@/lib/user-email-aliases";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const email = normalizeEmail(parsed.data.email);
  const applicantRow = await findApplicantForCredentialEmail(email);
  const applicant = applicantRow
    ? {
        id: applicantRow.id,
        email: applicantRow.email,
        name: applicantRow.name,
        status: applicantRow.status,
        stage: applicantRow.stage,
        isActive: applicantRow.isActive,
        chronosUserId: applicantRow.chronosUserId,
      }
    : null;

  if (!applicant || !applicant.isActive) return NextResponse.json({ ok: true });

  let user =
    applicant.chronosUserId
      ? (
          await db
            .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
            .from(users)
            .where(eq(users.id, applicant.chronosUserId))
            .limit(1)
        )[0]
      : undefined;
  if (!user) {
    const byEmail = await findUserByAnyEmail(applicant.email.toLowerCase());
    if (byEmail) {
      user = { id: byEmail.id, email: byEmail.email, name: byEmail.name, isActive: byEmail.isActive };
    }
  }

  if (!user || !user.isActive) return NextResponse.json({ ok: true });

  const [existing] = await db.select({ token: passwordResetTokens.token, expiresAt: passwordResetTokens.expiresAt }).from(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);

  // Cooldown: if a valid reset link already exists, don't send another email.
  if (existing) {
    return NextResponse.json({ ok: true, cooldown: true, expiresAt: existing.expiresAt });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);
  await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

  const appUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const resetUrl = `${appUrl}/register?reset=${encodeURIComponent(token)}`;

  await sendEmail({
    to: applicant.email,
    subject: "Reset your FloLabs Chronos password",
    text: `Hi ${applicant.name},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 2 hours.`,
    html: `<p>Hi ${applicant.name},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 2 hours.</p>`,
  });

  return NextResponse.json({ ok: true });
}
