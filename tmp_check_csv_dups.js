const fs = require('fs');

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        q = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

const path = 'C:\\Users\\olire\\Documents\\workspace_python\\FloLabs_Hermes\\old_workflow_assets\\Time_Entries_2026-04-20\\Time Entries 297a157695518075ab6cea94e60e4220_all.csv';
const text = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter(Boolean);
const header = splitCsvLine(lines[0]);
const idx = {};
header.forEach((h, i) => { idx[h] = i; });

const counts = new Map();
for (let i = 1; i < lines.length; i++) {
  const cols = splitCsvLine(lines[i]);
  const id = String(cols[idx['Entry ID']] || '').trim();
  if (!id) continue;
  counts.set(id, (counts.get(id) || 0) + 1);
}

const top = [...counts.entries()]
  .filter(([, c]) => c > 1)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 20);

console.log(JSON.stringify({
  duplicateIds: top.length,
  topDuplicates: top,
}, null, 2));
