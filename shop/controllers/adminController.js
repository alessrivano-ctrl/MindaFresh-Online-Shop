// Shop admin: staff log in with users ⨝ employees (shared authService).
// Roles (blueprint Section 6): admin = full (orders, customers, online products); accountant = view orders only.
import { Op, fn, col } from "sequelize";
import { login } from "../services/authService.js";
import { Order, OrderItem, Customer, Product, Category, StockLevel } from "../models/index.js";
import { advanceOrder, cancelOrder, returnOrder, NEXT_STATUS, ADMIN_CAN_CANCEL } from "../services/orderService.js";
import { ORDER_STATUS } from "../utils/viewHelpers.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";
import { manilaDate } from "../utils/dates.js";

const SHOP_ROLES = ["admin", "accountant"];
const NEXT_LABEL = { confirmed: "Confirm order", out_for_delivery: "Mark out for delivery", delivered: "Mark delivered" };

export const loginPage = (req, res) => {
  if (req.session.user && SHOP_ROLES.includes(req.session.user.role)) return res.redirect("/admin/orders");
  res.render("admin-login", { title: "Staff log in" });
};

export const loginStaff = async (req, res, next) => {
  try {
    const user = await login((req.body.username || "").trim(), req.body.password || "");
    if (!SHOP_ROLES.includes(user.role)) {
      req.flash("error_msg", "Your account cannot use the Shop admin. Only admin and accountant accounts can.");
      return res.redirect("/admin/login");
    }
    req.session.user = user;
    res.redirect("/admin/orders");
  } catch (err) {
    if (err instanceof AppError) {
      req.flash("error_msg", err.message);
      return res.redirect("/admin/login");
    }
    next(err);
  }
};

export const logoutStaff = (req, res) => {
  delete req.session.user;
  res.redirect("/admin/login");
};

export const ordersPage = async (req, res, next) => {
  try {
    const status = ORDER_STATUS[req.query.status] ? req.query.status : "";
    const q = (req.query.q || "").trim();
    const where = {};
    if (status) where.order_status = status;
    if (q) where[Op.or] = [{ order_code: { [Op.like]: `%${q}%` } }, { "$Customer.first_name$": { [Op.like]: `%${q}%` } }, { "$Customer.last_name$": { [Op.like]: `%${q}%` } }];

    const [orders, counts, todayRows] = await Promise.all([
      Order.findAll({ where, include: Customer, order: [["ordered_at", "DESC"]], limit: 200 }),
      Order.findAll({ attributes: ["order_status", [fn("COUNT", col("id")), "n"]], group: ["order_status"], raw: true }),
      Order.findAll({ where: { order_status: "delivered" }, attributes: ["total_amount", "delivered_at"], raw: true })
    ]);

    const countOf = Object.fromEntries(counts.map((c) => [c.order_status, Number(c.n)]));
    const total = Object.values(countOf).reduce((a, b) => a + b, 0);
    const today = manilaDate();
    const deliveredToday = todayRows.filter((r) => r.delivered_at && manilaDate(r.delivered_at) === today);

    res.render("admin-orders", {
      title: "Orders",
      nav: "orders",
      status,
      q,
      filters: [{ key: "", label: "All", n: total, active: !status },
        ...Object.entries(ORDER_STATUS).map(([key, s]) => ({ key, label: s.label, n: countOf[key] || 0, active: status === key }))],
      stats: {
        toConfirm: countOf.pending || 0,
        inProgress: (countOf.confirmed || 0) + (countOf.out_for_delivery || 0),
        deliveredToday: deliveredToday.length,
        salesToday: round2(deliveredToday.reduce((s, r) => s + Number(r.total_amount), 0))
      },
      orders: orders.map((o) => ({
        order_code: o.order_code,
        customer: `${o.Customer.first_name} ${o.Customer.last_name}`,
        ordered_at: o.ordered_at,
        total_amount: Number(o.total_amount),
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        order_status: o.order_status
      }))
    });
  } catch (err) {
    next(err);
  }
};

export const orderPage = async (req, res, next) => {
  try {
    const order = await Order.findOne({ where: { order_code: req.params.code }, include: [{ model: Customer, attributes: { exclude: ["password"] } }, OrderItem] });
    if (!order) {
      req.flash("error_msg", "Order not found.");
      return res.redirect("/admin/orders");
    }
    const nextStatus = NEXT_STATUS[order.order_status];
    const isAdmin = req.session.user.role === "admin";
    res.render("admin-order", {
      title: `Order ${order.order_code}`,
      nav: "orders",
      order: {
        ...order.get({ plain: true }),
        subtotal: Number(order.subtotal),
        shipping_fee: Number(order.shipping_fee),
        total_amount: Number(order.total_amount),
        customerName: `${order.Customer.first_name} ${order.Customer.last_name}`,
        items: order.OrderItems.map((i) => ({ ...i.get({ plain: true }), unit_price: Number(i.unit_price), line_total: Number(i.line_total) }))
      },
      isAdmin,
      nextLabel: isAdmin && nextStatus ? NEXT_LABEL[nextStatus] : null,
      canCancel: isAdmin && ADMIN_CAN_CANCEL.includes(order.order_status),
      canReturn: isAdmin && order.order_status === "delivered"
    });
  } catch (err) {
    next(err);
  }
};

// One handler for the three admin actions, so every action shows its result the same way
const runAction = (action, done) => async (req, res, next) => {
  try {
    const order = await action(req.params.code, { employeeId: req.session.user.employee_id });
    req.flash("success_msg", done(order));
  } catch (err) {
    if (!(err instanceof AppError)) return next(err);
    req.flash("error_msg", err.message);
  }
  res.redirect(`/admin/orders/${req.params.code}`);
};

export const advanceAction = runAction((code) => advanceOrder(code),
  (o) => `${o.order_code} is now ${ORDER_STATUS[o.order_status].label.toLowerCase()}.`);
export const cancelAction = runAction((code, opts) => cancelOrder(code, opts),
  (o) => `${o.order_code} was cancelled and its stock was returned.${o.payment_status === "refunded" ? " GCash payment marked refunded." : ""}`);
export const returnAction = runAction((code, opts) => returnOrder(code, opts),
  (o) => `${o.order_code} was marked returned, refunded, and its stock was put back.`);

export const customersPage = async (req, res, next) => {
  try {
    const customers = await Customer.findAll({ include: Order, order: [["id", "ASC"]] });
    res.render("admin-customers", {
      title: "Customers",
      nav: "customers",
      customers: customers.map((c) => {
        const delivered = c.Orders.filter((o) => o.order_status === "delivered");
        return {
          customer_code: c.customer_code,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email,
          phone: c.phone,
          city: c.city,
          status: c.status,
          orders: c.Orders.length,
          spent: round2(delivered.reduce((s, o) => s + Number(o.total_amount), 0))
        };
      })
    });
  } catch (err) {
    next(err);
  }
};

// Read-only: products, prices and stock belong to POS. Edit them in the POS module.
export const productsPage = async (req, res, next) => {
  try {
    const products = await Product.findAll({ include: [Category, StockLevel], order: [["product_code", "ASC"]] });
    res.render("admin-products", {
      title: "Online products",
      nav: "products",
      products: products.map((p) => {
        const stock = p.StockLevel?.quantity_on_hand ?? 0;
        return {
          product_code: p.product_code,
          name: p.name,
          category: p.Category?.name,
          unit: p.unit,
          price: Number(p.selling_price),
          stock,
          low: stock <= p.reorder_level,
          online: p.is_online && p.status === "active"
        };
      })
    });
  } catch (err) {
    next(err);
  }
};
