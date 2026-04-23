type ForgotPasswordResponse = {
  ok?: boolean;
  cooldown?: boolean;
  expiresAt?: string;
  error?: string;
  test?: {
    resendEmailId?: string | null;
    resetToken?: string;
    expiresAt?: string;
  };
};

type ResendEmailResponse = {
  id?: string;
  to?: string[];
  last_event?: string;
  subject?: string;
  created_at?: string;
};

const baseUrl = (process.env.CHRONOS_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || process.env.NEXTAUTH_URL || "")
  .trim()
  .replace(/\/$/, "");
const testEmail = (process.env.RESET_PASSWORD_TEST_EMAIL || "").trim().toLowerCase();
const testSecret = (process.env.RESET_PASSWORD_TEST_SECRET || "").trim();
const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
const testNewPassword = process.env.RESET_PASSWORD_TEST_NEW_PASSWORD?.trim() || null;

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`Missing ${name}`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} ${res.statusText}: ${text}`);
  }
  return body;
}

async function main() {
  requireEnv("CHRONOS_BASE_URL or NEXTAUTH_URL", baseUrl);
  requireEnv("RESET_PASSWORD_TEST_EMAIL", testEmail);
  requireEnv("RESET_PASSWORD_TEST_SECRET", testSecret);
  requireEnv("RESEND_API_KEY", resendApiKey);

  const forgot = await fetchJson<ForgotPasswordResponse>(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-reset-password-test-secret": testSecret,
    },
    body: JSON.stringify({ email: testEmail }),
  });

  if (!forgot.ok || !forgot.test?.resendEmailId || !forgot.test.resetToken) {
    throw new Error(`Unexpected forgot-password response: ${JSON.stringify(forgot)}`);
  }

  const resetInfo = await fetchJson<{ reset: { email: string; name: string } }>(
    `${baseUrl}/api/auth/reset-password?token=${encodeURIComponent(forgot.test.resetToken)}`
  );

  let delivery: ResendEmailResponse | null = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const res = await fetch(`https://api.resend.com/emails/${forgot.test.resendEmailId}`, {
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Resend retrieve-email failed ${res.status}: ${text}`);
    }
    delivery = JSON.parse(text) as ResendEmailResponse;
    if (delivery.last_event === "delivered") break;
    if (delivery.last_event && ["bounced", "failed", "complained", "canceled"].includes(delivery.last_event)) {
      throw new Error(`Reset email delivery failed with event=${delivery.last_event}`);
    }
    await sleep(5000);
  }

  if (!delivery || delivery.last_event !== "delivered") {
    throw new Error(`Reset email was not delivered in time: ${JSON.stringify(delivery)}`);
  }

  if (testNewPassword) {
    await fetchJson<{ ok: boolean }>(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: forgot.test.resetToken, password: testNewPassword }),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        testEmail,
        resendEmailId: forgot.test.resendEmailId,
        resendLastEvent: delivery.last_event,
        resetEmail: resetInfo.reset.email,
        resetName: resetInfo.reset.name,
        exercisedResetPost: Boolean(testNewPassword),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
