import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({ token: z.string().min(1), password: z.string().min(8) });

export async function GET(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const [reset] = await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt, usedAt: passwordResetTokens.usedAt }).from(passwordResetTokens).where(and(eq(passwordResetTokens.token, token), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
  if (!reset) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 404 });

  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, reset.userId)).limit(1);
  return NextResponse.json({ reset: { email: user?.email ?? "", name: user?.name ?? "" } });
}

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [reset] = await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId }).from(passwordResetTokens).where(and(eq(passwordResetTokens.token, parsed.data.token), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
  if (!reset) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 404 });

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
  await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, reset.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, reset.id));
  return NextResponse.json({ ok: true });
}
