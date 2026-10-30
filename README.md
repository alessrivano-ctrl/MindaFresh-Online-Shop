# MindaFresh ERP — Online Shop

The Online Shop module of **MindaFresh ERP**, an integrated web-based ERP system for MindaFresh Food Distribution, Inc. (Calapan City, Oriental Mindoro).

Customers browse products, add them to a cart and place orders for delivery (cash on delivery or GCash). The store admin confirms orders and moves them through delivery. The Shop shares one database (`mindafresh_db`) with the other four modules: POS, Attendance, HR, and Accounting & Finance.

## Features

**Customers**
- Register and log in
- Browse products with live stock, filter by category, search
- Cart with quantity checks against available stock
- Checkout with delivery address and payment method (COD or GCash)
- Order history with a delivery tracker
- Cancel an order while it is still pending

**Admin**
- Staff login using the shared `users` and `employees` tables
- Order list with status filters, search and today's totals
- Move orders: pending → confirmed → out for delivery → delivered
- Cancel or mark an order as returned (stock is returned automatically)
- Customer list and online product overview

Placing an order, deducting stock and saving the order items happen in one database transaction, so an order is never half-saved.

## Tech stack

- Node.js + Express (XianFire framework)
- MySQL 8 with Sequelize
- Handlebars views (`.xian`) + Tailwind CSS
- express-session, bcrypt

## Project structure

```
mindafresh-erp/
├── shared/          files used by all 5 modules
│   ├── database/    schema.sql, seed.sql
│   ├── config/      database connection
│   ├── models/      Sequelize models
│   ├── services/    authService, stockService
│   ├── middleware/  requireRole
│   ├── utils/       money, dates, errors
│   └── views/partials/  shared header and footer
└── shop/            Online Shop module (port 3001)
    ├── controllers/
    ├── routes/
    ├── services/    orderService
    ├── views/
    └── public/
```

## Setup (Laragon)

1. Start **Laragon** → **Start All**, then open **phpMyAdmin**.
2. Import `shared/database/schema.sql`, then `shared/database/seed.sql`.
3. In phpMyAdmin → SQL, create the database user:
   ```sql
   CREATE USER 'mindafresh'@'localhost' IDENTIFIED BY 'MindaFresh@2026';
   GRANT ALL PRIVILEGES ON mindafresh_db.* TO 'mindafresh'@'localhost';
   FLUSH PRIVILEGES;
   ```
4. In the terminal:
   ```
   cd mindafresh-erp
   node shared/sync.js
   cd shop
   copy .env.example .env
   npm install
   npm run dev
   ```
5. Open http://localhost:3001

To connect to the group's database host instead, set `DB_HOST` in `shop/.env` to the host laptop's IP address.

## Test accounts

| Role | Login | Password |
|---|---|---|
| Customer | ana.reyes@example.com | Customer@2026 |
| Admin | admin | Admin@2026 |
| Accountant (view only) | carla.accountant | Accountant@2026 |

Staff log in at http://localhost:3001/admin/login

## Group

| Module | Member | Port |
|---|---|---|
| Online Shop | Ali | 3001 |
| POS (with Inventory and Purchasing) | Bren | 3002 |
| Attendance | Brian | 3003 |
| HR | Fate | 3004 |
| Accounting & Finance | Jean | 3005 |
