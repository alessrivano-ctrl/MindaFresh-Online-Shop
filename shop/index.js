/*
    MIT License

    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */

// MindaFresh ERP — Online Shop (owner: Ali). Port 3001.
import "dotenv/config";
import express from "express";
import path from "path";
import session from "express-session";
import flash from "connect-flash";
import fs from "fs";
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import router from "./routes/index.js";
import { sequelize, CartItem } from "./models/index.js";
import { registerViewHelpers } from "./utils/viewHelpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "shop-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));
app.use(flash());

// XianFire's .xian view engine (Handlebars)
app.engine("xian", async (filePath, options, callback) => {
  try {
    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => (err ? reject(err) : resolve(html)));
    });
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");

// Partials (head, footer, shop-nav, ...) and helpers (peso, datetime, statusBadge, ...)
const partialsDir = path.join(__dirname, "views/partials");
for (const file of fs.readdirSync(partialsDir).filter((f) => f.endsWith(".xian"))) {
  hbs.registerPartial(file.replace(".xian", ""), fs.readFileSync(path.join(partialsDir, file), "utf8"));
}
registerViewHelpers();

// Values every page can use: flash messages, who is logged in, cart count
app.use(async (req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.appName = process.env.APP_NAME || "MindaFresh Online Shop";
  res.locals.customer = req.session.customer || null;
  res.locals.staff = req.session.user || null;
  res.locals.shippingFee = Number(process.env.SHIPPING_FEE ?? 50);
  res.locals.cartCount = 0;
  try {
    if (req.session.customer) {
      res.locals.cartCount = (await CartItem.sum("quantity", { where: { customer_id: req.session.customer.id } })) || 0;
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/", router);

// 404
app.use((req, res) => res.status(404).render("error", { title: "Page not found", heading: "Page not found",
  message: "That page does not exist. It may have been moved." }));

// Errors: "Database is offline" instead of a crash (blueprint Section 10)
app.use((err, req, res, next) => {
  const offline = ["SequelizeConnectionError", "SequelizeConnectionRefusedError", "SequelizeHostNotFoundError",
    "SequelizeAccessDeniedError", "SequelizeConnectionTimedOutError", "SequelizeHostNotReachableError"].includes(err.name);
  console.error(offline ? "❌ Database is offline:" : "❌", err.message);
  res.status(offline ? 503 : 500).render("error", {
    title: offline ? "Database is offline" : "Something went wrong",
    heading: offline ? "Database is offline" : "Something went wrong",
    message: offline
      ? "The Shop cannot reach the MindaFresh database right now. Check that the DB host laptop is on and that DB_HOST in .env is right, then reload."
      : "Please go back and try again."
  });
});

export default app;

// Check the database, then listen. Never sequelize.sync(): tables come only from shared/database/schema.sql.
export const startServer = async (port = PORT) => {
  try {
    await sequelize.authenticate();
    console.log(`✅ Connected to ${process.env.DB_NAME} on ${process.env.DB_HOST}`);
  } catch (err) {
    console.error(`⚠️  Database is offline (${err.message}). The Shop will start and show an offline page until it is back.`);
  }
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🔥 MindaFresh Online Shop running at http://localhost:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun && !process.env.XIAN_ELECTRON) {
  startServer();
}
