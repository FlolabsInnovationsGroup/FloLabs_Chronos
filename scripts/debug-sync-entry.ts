import fs from "fs";

for (const file of ['.env.local', '.env.production.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1).replace(/^"|"$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  const { syncAndNotifyEntry } = await import("../src/lib/entry-lifecycle");
  const entryId = process.argv[2];
  if (!entryId) throw new Error("entryId required");

  const result = await syncAndNotifyEntry(entryId);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
