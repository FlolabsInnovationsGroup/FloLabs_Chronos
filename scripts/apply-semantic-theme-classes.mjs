/**
 * Replace hardcoded hex in className strings with semantic theme utilities.
 * New UI should use tokens: bg-surface-container-low, text-on-background, border-surface-container, etc.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "src");

const replacements = [
  [/text-\[#31332f\]/g, "text-on-background"],
  [/text-\[#5e605b\]/g, "text-on-surface-variant"],
  [/text-\[#b2b2ad\]/g, "text-outline-variant"],
  [/text-\[#366769\]/g, "text-primary"],
  [/text-\[#a73b21\]/g, "text-error"],
  [/text-\[#791903\]/g, "text-error-dim"],
  [/text-\[#8f918b\]/g, "text-subtle-ink"],
  [/text-\[#755a40\]/g, "text-tertiary"],
  [/text-\[#104648\]/g, "text-on-primary-fixed"],
  [/text-\[#3d3e4e\]/g, "text-on-secondary-fixed"],
  [/text-\[#503921\]/g, "text-on-tertiary-fixed"],
  [/bg-\[#fbf9f5\]/g, "bg-background"],
  [/bg-\[#ffffff\]/g, "bg-surface-container-lowest"],
  [/\bbg-white\b/g, "bg-surface-container-lowest"],
  [/bg-\[#f5f4ef\]/g, "bg-surface-container-low"],
  [/hover:bg-\[#f5f4ef\]/g, "hover:bg-surface-container-low"],
  [/bg-\[#efeee9\]/g, "bg-surface-container"],
  [/hover:bg-\[#efeee9\]/g, "hover:bg-surface-container"],
  [/border-\[#efeee9\]/g, "border-surface-container"],
  [/border-\[#f4d5cc\]/g, "border-warm-border"],
  [/border-\[#d7d2c8\]/g, "border-sort-border"],
  [/bg-\[#e9e8e3\]/g, "bg-surface-container-high"],
  [/bg-\[#366769\]/g, "bg-primary"],
  [/hover:bg-\[#295a5d\]/g, "hover:bg-primary-dim"],
  [/bg-\[#a73b21\]/g, "bg-error"],
  [/hover:bg-\[#791903\]/g, "hover:bg-error-dim"],
  [/bg-\[#fff7f6\]/g, "bg-warm-surface"],
  [/hover:bg-\[#fff7f6\]/g, "hover:bg-warm-surface"],
  [/bg-\[#fde0d9\]/g, "bg-warm-muted"],
  [/bg-\[#e1e1f5\]/g, "bg-secondary-fixed"],
  [/hover:bg-\[#d3d3e6\]/g, "hover:bg-secondary-fixed-dim"],
  [/active:bg-\[#c5c5d8\]/g, "active:bg-surface-container-high"],
  [/bg-\[#b9ecee\]/g, "bg-primary-container"],
  [/bg-\[#fed9b8\]/g, "bg-tertiary-container"],
  [/placeholder:text-\[#b2b2ad\]/g, "placeholder:text-outline-variant"],
  [/focus:border-\[#366769\]/g, "focus:border-primary"],
  [/focus:ring-\[#366769\]\/20/g, "focus:ring-primary/20"],
  [/focus-within:ring-\[#366769\]\/20/g, "focus-within:ring-primary/20"],
  [/ring-\[#366769\]\/20/g, "ring-primary/20"],
  [/ring-\[#a73b21\]\/30/g, "ring-error/30"],
  [/ring-1 ring-\[#31332f\]\/6/g, "ring-1 ring-on-background/10"],
  [/accent-\[#366769\]/g, "accent-primary"],
  [/fixed inset-0 bg-\[#31332f\]\/20 backdrop-blur-sm/g, "fixed inset-0 backdrop-blur-sm bg-[color:var(--c-overlay-scrim)]"],
  [/bg-\[#31332f\]/g, "bg-chrome"],
  [/text-\[#e3feff\]/g, "text-on-primary"],
  [/text-\[#fbf9f5\]/g, "text-background"],
  [/hover:text-\[#31332f\]/g, "hover:text-on-background"],
  [/hover:text-\[#e3feff\]/g, "hover:text-on-primary"],
  [/border-\[#e3e3dc\]/g, "border-surface-container-highest"],
  [/bg-\[#31332f\]\/18/g, "bg-inverse-surface/20"],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(root)) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log("Updated files:", changed);
