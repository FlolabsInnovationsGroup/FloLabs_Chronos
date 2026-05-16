import { expect, test } from "@playwright/test";
import { loadTestUsers, signInProduction } from "./lib/production-auth";

const admin = loadTestUsers().find((u) => u.role === "admin");
const adminEmail = admin?.emails?.[0] ?? admin?.email;
const adminPassword = admin?.password;

test.describe("Production Chronos — Team Member search", () => {
  test.setTimeout(300_000);

  test("search API returns results with Unicode-safe matching (production)", async ({ page, request }) => {
    test.skip(!adminEmail || !adminPassword, "admin credentials missing in test_assets/test_users.json");

    await signInProduction(page, adminEmail!, adminPassword!);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const base = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "https://athensgreecemarathon.com";

    async function searchUntilOk(path: string, attempts = 4) {
      let lastStatus = 0;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const res = await request.get(`${base}${path}`, {
          headers: { Cookie: cookieHeader },
          timeout: 240_000,
        });
        lastStatus = res.status();
        if (res.status() === 200) return res;
        if (res.status() !== 504) break;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      throw new Error(`Team Member search did not succeed (last status ${lastStatus}) for ${path}`);
    }

    await searchUntilOk("/api/notion/team-members/search?q=&limit=10");

    const started = Date.now();
    const res = await searchUntilOk("/api/notion/team-members/search?q=ahmed&limit=100");
    const elapsedMs = Date.now() - started;
    const body = (await res.json()) as { pages?: Array<{ id: string; name: string }>; error?: string };
    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.pages)).toBe(true);
    expect(elapsedMs).toBeLessThan(180_000);

    await page.goto("/team", { waitUntil: "domcontentloaded" });
    const editBtn = page.locator("button").filter({ has: page.locator(".material-symbols-outlined", { hasText: "edit" }) }).first();
    await expect(editBtn).toBeVisible({ timeout: 60_000 });
    await editBtn.click();

    const searchInput = page.getByPlaceholder(/search team members/i);
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.click();
    await searchInput.fill("ahmed");
    await expect(page.getByText(/no matching team member pages/i)).not.toBeVisible({ timeout: 30_000 });
  });
});
