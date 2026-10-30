// shared/sync.js — copies the master files in shared/ into every module folder.
// Run from the repo root after every git pull:   node shared/sync.js
// Never edit a copied file inside a module; edit the master here (owner only), commit, and everyone syncs.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const sharedDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(sharedDir);
const MODULES = ["shop", "pos", "attendance", "hr", "accounting"];
const FOLDERS = ["config", "models", "services", "middleware", "utils", "views/partials"];

for (const mod of MODULES) {
  const modDir = path.join(root, mod);
  if (!fs.existsSync(modDir)) { console.log(`- ${mod}/ not found, skipped`); continue; }
  let copied = 0;
  for (const folder of FOLDERS) {
    const from = path.join(sharedDir, folder);
    if (!fs.existsSync(from)) continue;
    for (const file of fs.readdirSync(from)) {
      const src = path.join(from, file);
      if (!fs.statSync(src).isFile()) continue;
      const dest = path.join(modDir, folder, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src));
      if (!same) { fs.copyFileSync(src, dest); copied++; }
    }
  }
  console.log(`✓ ${mod}/  ${copied ? copied + " file(s) updated" : "up to date"}`);
}
