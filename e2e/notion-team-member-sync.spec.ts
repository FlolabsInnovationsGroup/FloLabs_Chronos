import { expect, test } from "@playwright/test";
import { loginChronosAdmin } from "./lib/auth";

const baseUrl =
  process.env.CHRONOS_BASE_URL ?? "https://hcmsmnfq5q.us-east-1.awsapprunner.com";

test.describe("Notion team member link parity", () => {
  test.setTimeout(180_000);

  test("Abhinav Singamaneni shows linked Team Member in Users edit modal", async ({ page }) => {
    await loginChronosAdmin(page, baseUrl);
    await page.goto(`${baseUrl}/team`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder(/search members/i);
    await search.fill("Abhinav");
    await expect(page.getByText("Abhinav Singamaneni")).toBeVisible({ timeout: 30_000 });

    const editBtn = page.getByRole("button", { name: /^edit$/i }).first();
    await editBtn.click();

    const notionInput = page.getByPlaceholder(/search team members/i);
    await expect(notionInput).toBeVisible({ timeout: 15_000 });
    const value = await notionInput.inputValue();
    expect(value.length).toBeGreaterThan(0);

    const searchRes = page.waitForResponse(
      (res) => res.url().includes("/api/notion/team-members/search") && res.ok(),
      { timeout: 60_000 }
    );
    await notionInput.fill("Abhinav");
    const response = await searchRes;
    const body = (await response.json()) as { pages?: Array<{ name: string }> };
    expect((body.pages ?? []).some((p) => /abhinav/i.test(p.name))).toBe(true);
  });
});
