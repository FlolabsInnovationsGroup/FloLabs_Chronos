import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/invitations";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const email = normalizeEmail(parsed.data.email);
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive }).from(users).where(eq(users.email, email)).limit(1);
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
    to: user.email,
    subject: "Reset your FloLabs Chronos password",
    text: `Hi ${user.name},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 2 hours.`,
    html: `<p>Hi ${user.name},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 2 hours.</p>`,
  });

  return NextResponse.json({ ok: true });
}
