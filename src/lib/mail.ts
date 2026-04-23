const RESEND_API_BASE = "https://api.resend.com/emails";

type EmailTag = { name: string; value: string };

function resolveEmailFrom(): string | null {
  const from = process.env.EMAIL_FROM?.trim() || process.env.INVITE_FROM_EMAIL?.trim();
  return from || null;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: EmailTag[];
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resolveEmailFrom();
  if (!apiKey || !from) {
    throw new Error("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (or INVITE_FROM_EMAIL).");
  }

  const res = await fetch(RESEND_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
      tags: params.tags,
    }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? null };
}
