import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { addPrimaryEmailAlias, ensureUserEmailAliasesSchema, getUserEmails } from '@/lib/user-email-aliases';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const emails = await getUserEmails(userId);
  return NextResponse.json({ emails });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const userId = String(body.userId ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();

  if (!userId || !email) {
    return NextResponse.json({ error: 'userId and email are required' }, { status: 400 });
  }

  await ensureUserEmailAliasesSchema();
  await addPrimaryEmailAlias(userId, email);
  const emails = await getUserEmails(userId);
  return NextResponse.json({ ok: true, emails });
}
