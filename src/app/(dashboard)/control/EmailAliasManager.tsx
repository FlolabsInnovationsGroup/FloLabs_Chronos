'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export function EmailAliasManager() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAliases() {
    if (!userId) return;
    setLoading(true);
    const res = await fetch(`/api/users/aliases?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({ emails: [] }));
    setEmails(data.emails ?? []);
    setLoading(false);
  }

  async function addAlias() {
    if (!userId || !email) return;
    setLoading(true);
    const res = await fetch('/api/users/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email }),
    });
    const data = await res.json().catch(() => ({ emails: [] }));
    setEmails(data.emails ?? []);
    setMessage(res.ok ? 'Alias saved.' : (data.error ?? 'Failed to save alias.'));
    setEmail('');
    setLoading(false);
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>Email alias manager</h2>
        <p className="text-sm text-on-surface-variant">Manually manage additional login emails for a user account.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <Input label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
        <Input label="Email alias" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
        <Button variant="secondary" onClick={() => void loadAliases()} loading={loading}>Load</Button>
        <Button onClick={() => void addAlias()} loading={loading}>Add alias</Button>
      </div>
      {message ? <p className="text-sm text-on-surface-variant">{message}</p> : null}
      {emails.length > 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-background">
          <p className="font-medium">Known emails</p>
          <p className="mt-2 text-on-surface-variant">{emails.join(', ')}</p>
        </div>
      ) : null}
    </Card>
  );
}
