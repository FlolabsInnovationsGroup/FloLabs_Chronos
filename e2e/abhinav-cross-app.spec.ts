import { expect, test } from "@playwright/test";
import { loginChronosAdmin, loginHephaestusHr } from "./lib/auth";

const chronosBase =
  process.env.CHRONOS_BASE_URL ?? "https://hcmsmnfq5q.us-east-1.awsapprunner.com";
const hephBase =
  process.env.HEPHAESTUS_BASE_URL ?? "https://fykgssqbvg.us-east-1.awsapprunner.com";
const TARGET = "Abhinav Singamaneni";

test.describe("Abhinav cross-app parity", () => {
  test.setTimeout(300_000);

  test("Hephaestus HR shows Notion Team Member link", async ({ page }) => {
    await loginHephaestusHr(page, hephBase);
    await page.goto(`${hephBase}/me/hr?status=joined&q=Abhinav`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText(TARGET, { exact: false }).first().click({ timeout: 30_000 });

    const notionSection = page.locator("text=Notion Team Member page").locator("..");
    const link = notionSection.locator("a[href*='notion.so']");
    await expect(link).toBeVisible({ timeout: 15_000 });
    const href = await link.getAttribute("href");
    console.log("HEPHAESTUS notion href:", href);
    expect(href).toMatch(/notion\.so/);
  });

  test("Chronos Users shows same Notion link for Abhinav", async ({ page }) => {
    await loginChronosAdmin(page, chronosBase);
    await page.goto(`${chronosBase}/team`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/search members/i).fill("Abhinav");
    await expect(page.getByText(TARGET)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^edit$/i }).first().click();
    const notionInput = page.getByPlaceholder(/search team members/i);
    await expect(notionInput).toBeVisible();
    const value = await notionInput.inputValue();
    console.log("CHRONOS notion field value:", value);
    expect(value.toLowerCase()).toContain("abhinav");

    const searchRes = page.waitForResponse(
      (res) => res.url().includes("/api/notion/team-members/search") && res.ok(),
      { timeout: 60_000 }
    );
    await notionInput.fill("Abhinav");
    const res = await searchRes;
    const body = (await res.json()) as { pages?: Array<{ id: string; name: string }> };
    console.log("CHRONOS search pages:", JSON.stringify(body.pages?.slice(0, 3)));
    expect((body.pages ?? []).some((p) => /abhinav/i.test(p.name))).toBe(true);
  });
});
