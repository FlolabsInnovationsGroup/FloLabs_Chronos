import { expect, test } from "@playwright/test";
import { markStory } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) suitePass = false; });
test.afterAll(async () => { await markStory(STORIES.CONTROL_PAGE, suitePass); });

test.describe("Control (production)", () => {
  test("admin can open Control and load settings without error", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").clear();
    await page.locator("#email").pressSequentially(email, { delay: 5 });
    await page.locator("#password").clear();
    await page.locator("#password").pressSequentially(password, { delay: 5 });
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/timer/, { timeout: 120_000 });

    await page.goto("/control", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Control" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Failed to load control settings.")).toBeHidden();

    const timeEntriesInput = page.getByLabel("Time Entries Database ID");
    await expect(timeEntriesInput).toBeVisible({ timeout: 15_000 });

    const controlRes = await page.request.get("/api/control");
    if (controlRes.ok()) {
      const body = (await controlRes.json()) as { config?: { notionDatabaseId?: string } };
      const fromApi = String(body.config?.notionDatabaseId ?? "");
      await expect(timeEntriesInput).toHaveValue(fromApi);
    }
  });
});
