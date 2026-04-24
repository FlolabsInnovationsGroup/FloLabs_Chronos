import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { applicants, passwordResetTokens, users } from "@/lib/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "@/lib/mail";
import { normalizeEmail, resolvePublicAppOrigin } from "@/lib/invitations";
import { findApplicantForCredentialEmail } from "@/lib/applicant-auth";
import { addPrimaryEmailAlias, findUserByAnyEmail } from "@/lib/user-email-aliases";
import bcrypt from "bcryptjs";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const email = normalizeEmail(parsed.data.email);
  const resetPasswordTestEmail = normalizeEmail(process.env.RESET_PASSWORD_TEST_EMAIL ?? "");
  const resetPasswordTestSecret = process.env.RESET_PASSWORD_TEST_SECRET?.trim() || null;
  const providedTestSecret = req.headers.get("x-reset-password-test-secret")?.trim() || null;
  const isAuthorizedResetPasswordTest =
    Boolean(resetPasswordTestSecret) &&
    Boolean(resetPasswordTestEmail) &&
    providedTestSecret === resetPasswordTestSecret &&
    email === resetPasswordTestEmail;

  const applicantRow = await findApplicantForCredentialEmail(email);
  let applicant = applicantRow
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

  let matchedByRequestedEmail = false;
  let user =
    applicant?.chronosUserId
      ? (
          await db
            .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
            .from(users)
            .where(eq(users.id, applicant.chronosUserId))
            .limit(1)
        )[0]
      : undefined;
  if (!user && applicant?.email) {
    const byApplicantEmail = await findUserByAnyEmail(applicant.email.toLowerCase());
    if (byApplicantEmail) {
      user = {
        id: byApplicantEmail.id,
        email: byApplicantEmail.email,
        name: byApplicantEmail.name,
        isActive: byApplicantEmail.isActive,
      };
      if (!applicant.chronosUserId) {
        await db
          .update(applicants)
          .set({ chronosUserId: byApplicantEmail.id, updatedAt: new Date() })
          .where(eq(applicants.id, applicant.id));
        applicant = { ...applicant, chronosUserId: byApplicantEmail.id };
      }
    }
  }
  if (!user) {
    const byRequestedEmail = await findUserByAnyEmail(email);
    if (byRequestedEmail) {
      matchedByRequestedEmail = true;
      user = {
        id: byRequestedEmail.id,
        email: byRequestedEmail.email,
        name: byRequestedEmail.name,
        isActive: byRequestedEmail.isActive,
      };
      if (applicant && !applicant.chronosUserId) {
        await db
          .update(applicants)
          .set({ chronosUserId: byRequestedEmail.id, updatedAt: new Date() })
          .where(eq(applicants.id, applicant.id));
        applicant = { ...applicant, chronosUserId: byRequestedEmail.id };
      }
    }
  }

  // If applicant exists but no linked Chronos user row was found yet, provision and link one now.
  if (!user && applicant?.email) {
    const generatedPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
    const [createdUser] = await db
      .insert(users)
      .values({
        email: applicant.email.toLowerCase(),
        name: applicant.name?.trim() || applicant.email.toLowerCase(),
        password: generatedPasswordHash,
        role: "member",
        isActive: Boolean(applicant.isActive),
      })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email, name: users.name, isActive: users.isActive });

    const resolvedUser = createdUser ?? (await findUserByAnyEmail(applicant.email.toLowerCase()));
    if (resolvedUser) {
      await db
        .update(applicants)
        .set({ chronosUserId: resolvedUser.id, updatedAt: new Date() })
        .where(eq(applicants.id, applicant.id));
      await addPrimaryEmailAlias(resolvedUser.id, applicant.email.toLowerCase());
      user = {
        id: resolvedUser.id,
        email: resolvedUser.email,
        name: resolvedUser.name,
        isActive: resolvedUser.isActive,
      };
      applicant = { ...applicant, chronosUserId: resolvedUser.id };
    }
  }

  if (!user || !user.isActive) return NextResponse.json({ ok: true });

  const recipientEmail = matchedByRequestedEmail ? email : applicant?.email?.trim() || user.email;
  const recipientName = applicant?.name?.trim() || user.name;

  const [existing] = await db
    .select({ id: passwordResetTokens.id, token: passwordResetTokens.token, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);

  let tokenToSend = existing?.token ?? "";
  let tokenExpiresAt = existing?.expiresAt ?? new Date(0);
  let tokenRowId = existing?.id ?? "";
  let createdNewToken = false;

  if (existing) {
    if (isAuthorizedResetPasswordTest) {
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, existing.id));
    } else {
      // UX reliability: keep anti-enumeration response shape, but resend the
      // same active token email instead of silently no-oping during cooldown.
      tokenToSend = existing.token;
      tokenExpiresAt = existing.expiresAt;
      tokenRowId = existing.id;
    }
  }

  if (!existing || isAuthorizedResetPasswordTest) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);
    const [createdReset] = await db
      .insert(passwordResetTokens)
      .values({ userId: user.id, token, expiresAt })
      .returning({ id: passwordResetTokens.id });
    tokenToSend = token;
    tokenExpiresAt = expiresAt;
    tokenRowId = createdReset.id;
    createdNewToken = true;
  }

  const resetUrl = `${resolvePublicAppOrigin(req.url)}/register?reset=${encodeURIComponent(tokenToSend)}`;

  try {
    const delivery = await sendEmail({
      to: recipientEmail,
      subject: "Reset your FloLabs Chronos password",
      text: `Hi ${recipientName},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 2 hours.`,
      html: `<p>Hi ${recipientName},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 2 hours.</p>`,
      headers: {
        "X-Chronos-Flow": "password-reset",
        "X-Chronos-User-Id": user.id,
      },
      tags: [
        { name: "flow", value: "password_reset" },
        { name: "app", value: "chronos" },
      ],
    });

    console.info("[auth/forgot-password] reset email accepted", {
      userId: user.id,
      applicantId: applicant?.id ?? null,
      email: recipientEmail,
      tokenId: tokenRowId,
      resendEmailId: delivery.id,
      isTest: isAuthorizedResetPasswordTest,
      cooldownResend: Boolean(existing && !isAuthorizedResetPasswordTest),
    });

    if (isAuthorizedResetPasswordTest) {
      return NextResponse.json({
        ok: true,
        test: {
          resendEmailId: delivery.id,
          resetToken: tokenToSend,
          expiresAt: tokenExpiresAt,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ...(existing && !isAuthorizedResetPasswordTest ? { cooldown: true, expiresAt: tokenExpiresAt } : {}),
    });
  } catch (error) {
    if (createdNewToken) {
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, tokenRowId));
    }

    console.error("[auth/forgot-password] reset email send failed", {
      userId: user.id,
      applicantId: applicant?.id ?? null,
      email: recipientEmail,
      tokenId: tokenRowId,
      isTest: isAuthorizedResetPasswordTest,
      error: error instanceof Error ? error.message : String(error),
    });

    if (isAuthorizedResetPasswordTest) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Could not send reset email",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  }
}
