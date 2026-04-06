import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

test.describe("Task picker (Notion)", () => {
  test("login, open task picker, /api/tasks returns tasks array and UI reflects response", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/timer/, { timeout: 30_000 });

    const taskInput = page.getByPlaceholder("Search Notion tasks…");
    await expect(taskInput).toBeVisible({ timeout: 15_000 });
    await taskInput.click();
    await taskInput.fill("");

    const responsePromise = page.waitForResponse((r) => {
      try {
        const u = new URL(r.url());
        return u.pathname.endsWith("/api/tasks") && u.searchParams.get("q") === "a" && r.request().method() === "GET";
      } catch {
        return false;
      }
    });
    await taskInput.fill("a");
    const res = await responsePromise;
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { tasks?: unknown[]; meta?: { taskSearchConfigured?: boolean }; error?: string };
    expect(Array.isArray(body.tasks)).toBeTruthy();
    expect(body.meta).toBeDefined();

    await expect(page.getByText("Searching tasks…")).toBeHidden({ timeout: 15_000 });

    if (body.error) {
      await expect(page.getByText(body.error, { exact: false })).toBeVisible();
      return;
    }

    if (body.meta?.taskSearchConfigured === false) {
      await expect(page.getByText(/not configured/i)).toBeVisible();
      return;
    }

    if ((body.tasks?.length ?? 0) > 0) {
      const firstTitle = String((body.tasks![0] as { title?: string }).title ?? "");
      await expect(page.getByRole("button", { name: firstTitle })).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.getByText("No matching tasks")).toBeVisible();
    }
  });
});
