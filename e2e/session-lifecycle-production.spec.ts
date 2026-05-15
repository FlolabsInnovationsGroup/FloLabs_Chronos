import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

const lifecycleDescriptionPrefix = "E2E Chronos session lifecycle";
const preferredRole = process.env.E2E_ROLE?.trim().toLowerCase();
const preferredEmail = process.env.E2E_EMAIL?.trim().toLowerCase();
const runAll = process.env.E2E_ALL_ACCOUNTS === "1";

type TimerHttpRecord = {
  method: string;
  url: string;
  status?: number;
  bodyPreview?: string;
  error?: string;
};

function sanitizeBodyPreview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 800);
}

async function attachDiagnostics(testInfo: TestInfo, records: TimerHttpRecord[], page: Page) {
  await testInfo.attach("timer-http-records.json", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("final-url.txt", { body: page.url(), contentType: "text/plain" });
  await testInfo.attach("final-page.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function chooseFirstProject(page: Page): Promise<string> {
  const projectButton = page.getByRole("button", { name: /select project/i }).first();
  await expect(projectButton).toBeVisible({ timeout: 60_000 });
  await projectButton.click();

  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible({ timeout: 30_000 });
  const label = (await options.first().innerText()).trim();
  await options.first().click();
  return label;
}

async function runSessionLifecycle(page: Page, testInfo: TestInfo, email: string, password: string, role: string) {
  const records: TimerHttpRecord[] = [];

  page.on("response", async (response) => {
    try {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/api/timer") && !url.pathname.startsWith("/api/entries")) return;
      records.push({
        method: response.request().method(),
        url: `${url.pathname}${url.search}`,
        status: response.status(),
        bodyPreview: sanitizeBodyPreview(await response.text().catch((error) => `<<body unavailable: ${String(error)}>>`)),
      });
    } catch (error) {
      records.push({ method: response.request().method(), url: response.url(), error: String(error) });
    }
  });

  page.on("pageerror", (error) => {
    records.push({ method: "PAGEERROR", url: page.url(), error: error.message });
  });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      records.push({ method: `CONSOLE:${message.type()}`, url: page.url(), error: message.text() });
    }
  });

  await signInProduction(page, email, password);
  await expect(page.getByPlaceholder("What are you working on?")).toBeVisible({ timeout: 90_000 });

  // Make the test deterministic: if a previous failed run left an active timer, stop/discard it first.
  const stopIfPresent = page.getByRole("button", { name: /stop session/i });
  if (await stopIfPresent.isVisible().catch(() => false)) {
    await stopIfPresent.click();
    await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 90_000 });
  }

  const description = `${lifecycleDescriptionPrefix} — ${role} — ${new Date().toISOString()}`;
  await page.getByPlaceholder("What are you working on?").fill(description);
  const projectLabel = await chooseFirstProject(page);

  const startResponsePromise = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return url.pathname === "/api/timer/start" && response.request().method() === "POST";
      } catch {
        return false;
      }
    },
    { timeout: 120_000 }
  );

  await page.getByRole("button", { name: /start session/i }).click();
  const startResponse = await startResponsePromise;
  const startBody = await startResponse.text();
  if (!startResponse.ok()) {
    await attachDiagnostics(testInfo, records, page);
    throw new Error(`/api/timer/start failed with ${startResponse.status()}: ${sanitizeBodyPreview(startBody)}`);
  }
  expect(() => JSON.parse(startBody), `/api/timer/start must return valid JSON. Body: ${sanitizeBodyPreview(startBody)}`).not.toThrow();

  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /stop session/i })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1_500);

  // Re-assert details while active, because this is the user-visible lifecycle Oliver asked us to prove.
  await expect(page.getByPlaceholder("What are you working on?")).toHaveValue(description);
  await expect(page.getByText(new RegExp(projectLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first()).toBeVisible({ timeout: 30_000 });

  const stopResponsePromise = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return url.pathname === "/api/timer/stop" && response.request().method() === "POST";
      } catch {
        return false;
      }
    },
    { timeout: 120_000 }
  );
  await page.getByRole("button", { name: /stop session/i }).click();
  const stopResponse = await stopResponsePromise;
  const stopBody = await stopResponse.text();
  if (!stopResponse.ok()) {
    await attachDiagnostics(testInfo, records, page);
    throw new Error(`/api/timer/stop failed with ${stopResponse.status()}: ${sanitizeBodyPreview(stopBody)}`);
  }

  await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(description)).toBeVisible({ timeout: 120_000 });
  await attachDiagnostics(testInfo, records, page);
}

const users = loadTestUsers();
const testCases = users.flatMap((user) => {
  const emails = extractEmails(user);
  return emails.map((email) => ({ email, password: user.password, role: user.role }));
});

const selectedCases = runAll
  ? testCases
  : testCases.filter((tc) => {
      if (preferredEmail) return tc.email === preferredEmail;
      if (preferredRole) return tc.role.toLowerCase() === preferredRole;
      return tc.role.toLowerCase().includes("human") || tc.email.includes("oliver");
    }).slice(0, 1);

test.describe("Production — session lifecycle acceptance", () => {
  test.skip(selectedCases.length === 0, "No matching accounts found in test_assets/test_users.json");

  for (const account of selectedCases) {
    test(`can start, run >=1s, assign project, stop, and see persisted entry (${account.role}: ${account.email})`, async ({ page }, testInfo) => {
      test.setTimeout(360_000);
      await runSessionLifecycle(page, testInfo, account.email, account.password, account.role);
    });
  }
});
