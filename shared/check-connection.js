// shared/check-connection.js — tests one module's link to the shared database, step by step.
// Run from the repo root (mindafresh-erp/):
//   node shared/check-connection.js pos
//   node shared/check-connection.js hr --user liza.hr --pass Hr@2026     (also tests a staff login)
// It reads <module>/.env and uses the module's own mysql2 (and bcrypt), so run `npm install` in the module first.
// It changes nothing in the database: the one test write is rolled back.
import fs from "fs";
import net from "net";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const sharedDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(sharedDir);
const PORTS = { shop: 3001, pos: 3002, attendance: 3003, hr: 3004, accounting: 3005 };
const TABLES = ["departments", "employees", "users", "leave_requests", "payroll_runs", "payroll_items",
  "categories", "products", "stock_levels", "stock_movements", "suppliers", "purchase_orders", "purchase_order_items",
  "sales", "sale_items", "customers", "cart_items", "orders", "order_items", "holidays", "attendance_logs",
  "accounts", "journal_entries", "journal_lines", "salary_releases", "remittances"];

const args = process.argv.slice(2);
const mod = args[0];
const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };

let failed = 0, warned = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg, fix) => { warned++; console.log(`  ! ${msg}${fix ? `\n      → ${fix}` : ""}`); };
const bad = (msg, fix) => { failed++; console.log(`  ✗ ${msg}${fix ? `\n      → ${fix}` : ""}`); };
const stop = () => { summary(); process.exit(1); };
function summary() {
  console.log("");
  if (failed) console.log(`✗ ${failed} problem(s) to fix. Fix the first ✗, then run this again.`);
  else console.log(`✓ ${mod} is connected to the shared database.${warned ? ` (${warned} warning(s) above)` : ""}`);
}

// --- 1. module and .env ------------------------------------------------------------
if (!PORTS[mod]) {
  console.log("Usage: node shared/check-connection.js <shop|pos|attendance|hr|accounting> [--user <username> --pass <password>]");
  process.exit(1);
}
const modDir = path.join(root, mod);
console.log(`\nMindaFresh ERP · connection check for ${mod}/\n`);
console.log("1. Module and .env");
if (!fs.existsSync(modDir)) { bad(`Folder ${mod}/ not found next to shared/`, "Run this from the mindafresh-erp folder, after creating the module with xianfires new"); stop(); }
const envPath = path.join(modDir, ".env");
if (!fs.existsSync(envPath)) { bad(`${mod}/.env not found`, `Copy ${mod}/.env.example to ${mod}/.env and fill in the database block`); stop(); }

// Small .env reader (no dotenv needed): KEY=value, quotes and # comments allowed
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (/^["']/.test(v)) v = v.slice(1, v.indexOf(v[0], 1));
  else v = v.replace(/\s+#.*$/, "").trim();
  env[m[1]] = v;
}
const missing = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASS"].filter((k) => !env[k]);
if (missing.length) { bad(`.env is missing ${missing.join(", ")}`, "Copy the database block from the setup guide (Step 2)"); stop(); }
ok(`.env found · DB_HOST=${env.DB_HOST} DB_PORT=${env.DB_PORT} DB_NAME=${env.DB_NAME} DB_USER=${env.DB_USER}`);
if (env.DB_NAME !== "mindafresh_db") bad(`DB_NAME is "${env.DB_NAME}"`, "All 5 modules must use DB_NAME=mindafresh_db");
if (Number(env.PORT) !== PORTS[mod]) warn(`PORT is ${env.PORT || "not set"}; ${mod} should be ${PORTS[mod]}`, `Set PORT=${PORTS[mod]} in ${mod}/.env`);
else ok(`PORT=${env.PORT}`);

const modRequire = createRequire(path.join(modDir, "package.json"));
let mysql;
try { mysql = modRequire("mysql2/promise"); }
catch { bad(`mysql2 is not installed in ${mod}/`, `cd ${mod} && npm install`); stop(); }

// --- 2. network --------------------------------------------------------------------
console.log(`\n2. Network: can this laptop reach ${env.DB_HOST}:${env.DB_PORT}?`);
const reach = await new Promise((resolve) => {
  const s = net.connect({ host: env.DB_HOST, port: Number(env.DB_PORT), timeout: 5000 });
  s.on("connect", () => { s.destroy(); resolve("ok"); });
  s.on("timeout", () => { s.destroy(); resolve("timeout"); });
  s.on("error", (e) => resolve(e.code));
});
if (reach === "ok") ok(`Port ${env.DB_PORT} on ${env.DB_HOST} is open`);
else if (reach === "ECONNREFUSED") { bad(`${env.DB_HOST} answered but nothing is listening on port ${env.DB_PORT}`, "On the DB host: Laragon → Start All. In my.ini put # before skip-grant-tables and use bind-address=0.0.0.0 (Step 1.2), then Stop → Start All"); stop(); }
else if (reach === "ENOTFOUND") { bad(`DB_HOST "${env.DB_HOST}" is not a valid address`, "Use the IPv4 address from ipconfig on the DB host, for example 192.168.1.10"); stop(); }
else {
  bad(`No answer from ${env.DB_HOST} (${reach})`, [
    "Check that both laptops are on the SAME Wi-Fi",
    "Run ipconfig on the DB host again: the IP may have changed",
    "On the DB host: firewall rule for port 3306 and the Wi-Fi set to Private (Step 1.5–1.6)",
    "School Wi-Fi often blocks laptop-to-laptop traffic: use a phone hotspot"].join("\n      → "));
  stop();
}

// --- 3. login and database -----------------------------------------------------------
console.log("\n3. MySQL login and database");
let db;
try {
  db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
    password: env.DB_PASS, database: env.DB_NAME, timezone: "+08:00", connectTimeout: 8000 });
  ok(`Logged in as ${env.DB_USER} to ${env.DB_NAME}`);
} catch (e) {
  const fixes = {
    ER_ACCESS_DENIED_ERROR: "Check DB_USER and DB_PASS. On the DB host, run the CREATE USER and GRANT lines (Step 1.3), BOTH the '%' and 'localhost' ones",
    ER_DBACCESS_DENIED_ERROR: "On the DB host, run the GRANT lines and FLUSH PRIVILEGES (Step 1.3)",
    ER_BAD_DB_ERROR: "On the DB host, import shared/database/schema.sql, then seed.sql (Step 1.4)",
    ER_HOST_NOT_PRIVILEGED: "On the DB host, create the 'mindafresh'@'%' account (Step 1.3)"
  };
  bad(`MySQL refused: ${e.code} — ${e.message}`, fixes[e.code] || "Read the message above; ask in the group chat with a screenshot");
  stop();
}

const [[ver]] = await db.query("SELECT VERSION() AS v, NOW() AS now");
ok(`Server ${ver.v} · its clock says ${new Date(ver.now).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)`);

const [tables] = await db.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?", [env.DB_NAME]);
const have = new Set(tables.map((r) => r.t));
const absent = TABLES.filter((t) => !have.has(t));
const extra = [...have].filter((t) => !TABLES.includes(t));
if (!absent.length) ok("All 26 tables are there");
else bad(`${absent.length} table(s) missing: ${absent.join(", ")}`, "On the DB host, re-import shared/database/schema.sql into an empty mindafresh_db");
if (extra.length) warn(`Extra table(s) not in schema.sql: ${extra.join(", ")}`, "Someone ran sequelize.sync() or edited the database by hand. Remove them, and remove every sync() call");

if (!absent.length) {
  const [[n]] = await db.query("SELECT (SELECT COUNT(*) FROM employees) e, (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM accounts) a, (SELECT COUNT(*) FROM customers) c");
  if (n.e >= 7 && n.u >= 6 && n.p >= 10 && n.a >= 16) ok(`Seed data present · ${n.e} employees, ${n.u} staff logins, ${n.p} products, ${n.a} accounts, ${n.c} customers`);
  else bad(`Seed data looks incomplete · ${n.e} employees, ${n.u} users, ${n.p} products, ${n.a} accounts`, "On the DB host, import shared/database/seed.sql (after schema.sql)");

  // CHECK constraints work? (MySQL older than 8.0.16 silently ignores them.) Each test is rolled back.
  const rejects = async (value) => {
    await db.beginTransaction();
    try {
      await db.query("INSERT INTO holidays (holiday_date, name, holiday_type) VALUES ('1900-01-01', 'check-connection test', ?)", [value]);
      return false;
    } catch (e) {
      if (/check|constraint/i.test(e.message)) return true;
      throw e;
    } finally {
      await db.rollback();
    }
  };
  try {
    if (!(await rejects("bogus"))) bad("CHECK constraints are NOT enforced: 'bogus' was accepted as a holiday_type", "Use MySQL 8.0.16+ in Laragon (right-click Laragon → MySQL → Version)");
    else {
      ok("CHECK constraints are enforced (an unknown status value is rejected)");
      if (await rejects("Regular")) ok("Status values are case-sensitive ('Regular' is rejected, only 'regular' works)");
      else warn("Status values ignore capital letters: 'Regular' was accepted (same for 'Completed', 'PENDING')",
        "On the DB host, import shared/database/migrations/001-case-sensitive-status.sql (once the group agrees)");
    }
  } catch (e) {
    warn(`Could not test CHECK constraints: ${e.message}`);
  }
}

// --- 4. optional staff login -------------------------------------------------------
const user = flag("--user"), pass = flag("--pass");
if (user) {
  console.log(`\n4. Staff login for "${user}" (users ⨝ employees)`);
  const [rows] = await db.query("SELECT u.password, u.role, u.status AS us, e.status AS es, e.employee_code, e.first_name, e.last_name FROM users u JOIN employees e ON e.id = u.employee_id WHERE u.username = ?", [user]);
  if (!rows.length) bad(`No user named "${user}"`, "Check the username (seed accounts are in blueprint Section 6)");
  else {
    const r = rows[0];
    let bcrypt = null;
    try { bcrypt = modRequire("bcrypt"); } catch { try { bcrypt = modRequire("bcryptjs"); } catch { /* none */ } }
    if (!bcrypt) warn(`bcrypt not installed in ${mod}/, so the password was not checked`, `cd ${mod} && npm install bcrypt`);
    else if (!(await bcrypt.compare(pass || "", r.password))) bad("Wrong password for this user");
    else ok(`Password OK · ${r.employee_code} ${r.first_name} ${r.last_name} · role ${r.role}`);
    if (r.us !== "active" || r.es !== "active") bad(`This account cannot log in: user ${r.us}, employee ${r.es}`);
  }
}

// --- 5. the module's own code --------------------------------------------------------
console.log(`\n${user ? 5 : 4}. ${mod}/ code`);
const jsFiles = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "public"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".js")) jsFiles.push(p);
  }
})(modDir);
const syncers = jsFiles.filter((f) => /\.sync\s*\(/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
if (syncers.length) bad(`sequelize.sync() found in ${syncers.map((f) => path.relative(root, f)).join(", ")}`, "Delete those sync() calls: with force they wipe the shared tables for all 5 modules (blueprint Section 3)");
else ok("No sequelize.sync() calls");

const FOLDERS = ["config", "models", "services", "middleware", "utils", "views/partials"];
const stale = [];
for (const folder of FOLDERS) {
  const from = path.join(sharedDir, folder);
  if (!fs.existsSync(from)) continue;
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f), dest = path.join(modDir, folder, f);
    if (!fs.statSync(src).isFile()) continue;
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(fs.readFileSync(src))) stale.push(`${folder}/${f}`);
  }
}
if (stale.length) warn(`${stale.length} shared file(s) differ from shared/: ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", …" : ""}`, "Run node shared/sync.js (never edit the copies inside your module)");
else ok("Shared files are up to date with shared/");

await db.end();
summary();
process.exit(failed ? 1 : 0);
