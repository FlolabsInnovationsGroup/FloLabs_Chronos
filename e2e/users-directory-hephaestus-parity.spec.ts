import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { credentialsForRole, loginChronosAdmin, loginHephaestusHr } from "./lib/auth";

const HEPHAESTUS_URL =
  process.env.HEPHAESTUS_BASE_URL?.trim() || "https://fykgssqbvg.us-east-1.awsapprunner.com";
const CHRONOS_URL = process.env.CHRONOS_BASE_URL?.trim() || "https://athensgreecemarathon.com";

async function fetchHephaestusJoinedIds(page: import("@playwright/test").Page): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const limit = 200;
  let expectedTotal: number | null = null;
  for (;;) {
    const res = await page.request.get(
      `${HEPHAESTUS_URL}/api/admin/leads?status=joined&limit=${limit}&offset=${offset}`,
    );
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()) as {
      leads?: Array<{ id: string }>;
      hasMore?: boolean;
      total?: number;
    };
    if (expectedTotal === null && typeof data.total === "number") {
      expectedTotal = data.total;
    }
    for (const lead of data.leads ?? []) {
      if (lead.id) ids.push(lead.id);
    }
    if (!data.hasMore || (data.leads?.length ?? 0) === 0) break;
    offset += limit;
  }
  const unique = [...new Set(ids)];
  if (expectedTotal !== null) {
    expect(unique.length, "Hephaestus joined pagination must return every row").toBe(expectedTotal);
  }
  return unique;
}

async function fetchChronosUserIds(page: import("@playwright/test").Page): Promise<string[]> {
  const res = await page.request.get(`${CHRONOS_URL}/api/users`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as { users?: Array<{ id: string }> };
  return (data.users ?? []).map((user) => user.id).filter(Boolean);
}

test.describe("Users directory parity (browser)", () => {
  test("Chronos /api/users ids match Hephaestus HR status=joined ids", async ({ page }) => {
    test.setTimeout(300_000);

    await loginHephaestusHr(page, HEPHAESTUS_URL);
    const hepIds = [...new Set(await fetchHephaestusJoinedIds(page))];

    await loginChronosAdmin(page, CHRONOS_URL);
    const chronosIds = [...new Set(await fetchChronosUserIds(page))];

    const hepSet = new Set(hepIds);
    const chronosSet = new Set(chronosIds);

    const onlyChronos = chronosIds.filter((id) => !hepSet.has(id));
    const onlyHephaestus = hepIds.filter((id) => !chronosSet.has(id));

    const report = {
      generatedAt: new Date().toISOString(),
      hephaestusUrl: `${HEPHAESTUS_URL}/me/hr?status=joined`,
      chronosUrl: `${CHRONOS_URL}/team`,
      hephaestusCount: hepIds.length,
      chronosCount: chronosIds.length,
      onlyOnChronosCount: onlyChronos.length,
      onlyOnHephaestusCount: onlyHephaestus.length,
      onlyOnChronos: onlyChronos.slice(0, 50),
      onlyOnHephaestus: onlyHephaestus.slice(0, 50),
    };

    const reportPath = join(process.cwd(), "test-results", "users-directory-parity.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(onlyChronos, `Chronos-only ids (see ${reportPath})`).toEqual([]);
    expect(onlyHephaestus, `Hephaestus-only ids (see ${reportPath})`).toEqual([]);
    expect(chronosIds.length).toBe(hepIds.length);
  });
});
