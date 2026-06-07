import { expect, test } from "@playwright/test";
import { chronosBaseUrl, hephaestusBaseUrl, loginChronosAdmin, loginHephaestusHr } from "./lib/auth";

const HEPHAESTUS_URL = hephaestusBaseUrl();
const CHRONOS_URL = chronosBaseUrl();

test.describe("Users directory UI parity (browser)", () => {
  test("Chronos Users tab row count matches Hephaestus joined HR list total", async ({ page }) => {
    test.setTimeout(300_000);

    await loginHephaestusHr(page, HEPHAESTUS_URL);
    const hepTotalRes = await page.request.get(
      `${HEPHAESTUS_URL}/api/admin/leads?status=joined&limit=1&offset=0`,
    );
    const hepTotal = Number(((await hepTotalRes.json()) as { total?: number }).total ?? 0);

    await loginChronosAdmin(page, CHRONOS_URL);
    const usersLoaded = page.waitForResponse(
      (res) => res.url().includes("/api/users") && res.status() === 200,
      { timeout: 120_000 },
    );
    await page.goto(`${CHRONOS_URL}/team`, { waitUntil: "domcontentloaded" });
    await usersLoaded;
    await expect(page.locator("table tbody tr")).toHaveCount(hepTotal, { timeout: 120_000 });
    const chronosRows = await page.locator("table tbody tr").count();

    expect(chronosRows).toBe(hepTotal);
    expect(chronosRows).toBeGreaterThan(50);
  });
});
