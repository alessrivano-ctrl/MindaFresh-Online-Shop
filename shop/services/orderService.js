// shop/services/orderService.js — OrderService (class diagram Figure 2, composite structure Figure 5)
// Golden rule: an order and its stock change happen in ONE transaction, so there is never half an order.
import { Op } from "sequelize";
import { sequelize, Product, Order, OrderItem, Customer } from "../models/index.js";
import { ORDER_FLOW, CANCEL_RULES } from "../models/Order.js";
import { deductStock, returnStock } from "./stockService.js";
import * as cartService from "./cartService.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";
import { manilaDate } from "../utils/dates.js";

export const ORDER_STATUSES = ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled", "returned"];

// +placeOrder(customerId, method, address) — IPlaceOrder port (Figure 5), sequence diagram (Figure 10):
// get the cart and compute the totals, then in ONE transaction create the order, deduct stock
// through POS's stockService, save the items with price snapshots and clear the cart.
export async function placeOrder(customerId, { payment_method, address, city, phone }) {
  if (!["cod", "gcash"].includes(payment_method))
    throw new AppError("VALIDATION_ERROR", "Please choose cash on delivery or GCash.");
  address = (address || "").trim();
  city = (city || "").trim();
  if (!address || !city) throw new AppError("VALIDATION_ERROR", "Please enter your delivery address and city.");
  const delivery_address = `${address}, ${city}`.slice(0, 255);

  // 1. Get the cart with live prices from POS's products table, and compute the totals
  const { items } = await cartService.getCart(customerId);
  if (!items.length) throw new AppError("VALIDATION_ERROR", "Your cart is empty.");
  const gone = items.find((i) => i.unavailable);
  if (gone) throw new AppError("PRODUCT_UNAVAILABLE", `${gone.name} is no longer sold online. Please remove it from your cart.`);
  const { subtotal, shipping_fee, total } = cartService.computeTotals(items);

  // 2. One transaction: create the order, deduct stock (rows locked), save items, clear the cart
  return sequelize.transaction(async (t) => {
    const order = await Order.create({
      customer_id: customerId,
      subtotal,
      shipping_fee,
      total_amount: total,
      total_cost: 0,
      payment_method,
      payment_status: payment_method === "gcash" ? "paid" : "unpaid",
      order_status: "pending",
      delivery_address,
      ordered_at: new Date()
    }, { transaction: t });

    // Throws INSUFFICIENT_STOCK ("Only 2 left of Calamansi 1kg Pack.") and rolls everything back
    const deducted = await deductStock({ items: items.map(({ product_id, quantity }) => ({ product_id, quantity })), order_id: order.id }, t);
    const costOf = Object.fromEntries(deducted.map((d) => [d.product_id, Number(d.unit_cost)]));

    await OrderItem.bulkCreate(items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
      unit_cost: costOf[i.product_id],
      line_total: i.line_total
    })), { transaction: t });
    order.total_cost = round2(items.reduce((sum, i) => sum + i.quantity * costOf[i.product_id], 0));
    await order.save({ transaction: t });

    await cartService.clear(customerId, t);
    // Remember the address for next time (the Shop owns the customers table)
    await Customer.update({ address, city, ...(phone ? { phone: phone.trim() } : {}) }, { where: { id: customerId }, transaction: t });
    return order;
  });
}

// Lock the order row so two clicks (or two admins) cannot change it at the same time
async function lockOrder(orderCode, t, customerId = null) {
  const where = { order_code: orderCode, ...(customerId ? { customer_id: customerId } : {}) };
  const order = await Order.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (!order) throw new AppError("VALIDATION_ERROR", "Order not found.");
  return order;
}

export { CANCEL_RULES };

const words = (s) => s.replaceAll("_", " ");

// The next delivery step of a status (pending → confirmed → out_for_delivery → delivered), or null
export const nextStep = (status) => {
  const step = (ORDER_FLOW[status] ?? [])[0];
  return step && !["cancelled", "returned"].includes(step) ? step : null;
};

// +advanceStatus(orderCode, next) — IManageOrder: one delivery step at a time, never skipping
export async function advanceStatus(orderCode, next = null) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t);
    const step = nextStep(order.order_status);
    if (!step || (next && next !== step) || !order.nextStatuses().includes(step))
      throw new AppError("VALIDATION_ERROR", `A ${words(order.order_status)} order cannot move to ${words(next || "the next step")}.`);
    order.order_status = step;
    if (step === "delivered") {
      order.payment_status = "paid";  // COD is collected by the rider; GCash was already paid
      order.delivered_at = new Date(); // Accounting posts the sale on delivery
    }
    await order.save({ transaction: t });
    return order;
  });
}

// +cancelOrder(orderCode, role) — before delivery: return the stock, refund GCash.
// No accounting entry (a sale is posted only on delivery). role = "customer" | "admin".
export async function cancelOrder(orderCode, role, { customerId = null, employeeId = null } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t, role === "customer" ? customerId : null);
    if (!order.canCancel(role)) {
      throw new AppError("VALIDATION_ERROR", role === "customer"
        ? "This order is already confirmed, so it can no longer be cancelled here. Please contact the store."
        : `A ${words(order.order_status)} order cannot be cancelled.`);
    }
    order.order_status = "cancelled";
    if (order.payment_status === "paid") order.payment_status = "refunded";
    await order.save({ transaction: t });
    await returnStock({ order_id: order.id, employee_id: employeeId }, t);
    return order;
  });
}

// +recordReturn(orderCode) — returned after delivery: refund and return the stock. Accounting posts a reversal.
export async function recordReturn(orderCode, { employeeId = null } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t);
    if (!order.nextStatuses().includes("returned")) throw new AppError("VALIDATION_ERROR", "Only a delivered order can be returned.");
    order.order_status = "returned";
    order.payment_status = "refunded";
    await order.save({ transaction: t });
    await returnStock({ order_id: order.id, employee_id: employeeId }, t);
    return order;
  });
}

// --- Reading orders ------------------------------------------------------------------

function toView(o) {
  return {
    order_code: o.order_code,
    ordered_at: o.ordered_at,
    delivered_at: o.delivered_at,
    order_status: o.order_status,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    delivery_address: o.delivery_address,
    subtotal: Number(o.subtotal),
    shipping_fee: Number(o.shipping_fee),
    total_amount: Number(o.total_amount),
    items: (o.OrderItems || []).map((i) => ({
      product_name: i.product_name,
      product_code: i.Product?.product_code,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total)
    }))
  };
}

export async function listForCustomer(customerId) {
  const orders = await Order.findAll({ where: { customer_id: customerId }, include: OrderItem, order: [["ordered_at", "DESC"]] });
  return orders.map((o) => {
    const v = toView(o);
    return { ...v, itemCount: v.items.reduce((s, i) => s + i.quantity, 0),
             summary: v.items.map((i) => `${i.quantity} × ${i.product_name}`).join(", ") };
  });
}

export async function getForCustomer(customerId, orderCode) {
  const o = await Order.findOne({ where: { order_code: orderCode, customer_id: customerId }, include: { model: OrderItem, include: Product } });
  return o && toView(o);
}

const safeCustomer = { model: Customer, attributes: { exclude: ["password"] } };

export async function listForAdmin({ status = "", q = "" } = {}) {
  const where = {};
  if (ORDER_STATUSES.includes(status)) where.order_status = status;
  if (q) where[Op.or] = [{ order_code: { [Op.like]: `%${q}%` } },
    { "$Customer.first_name$": { [Op.like]: `%${q}%` } }, { "$Customer.last_name$": { [Op.like]: `%${q}%` } }];

  const [orders, all] = await Promise.all([
    Order.findAll({ where, include: safeCustomer, order: [["ordered_at", "DESC"]], limit: 200 }),
    Order.findAll({ attributes: ["order_status", "total_amount", "delivered_at"], raw: true })
  ]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, all.filter((o) => o.order_status === s).length]));
  const today = manilaDate();
  const deliveredToday = all.filter((o) => o.order_status === "delivered" && o.delivered_at && manilaDate(o.delivered_at) === today);
  return {
    counts,
    total: all.length,
    stats: {
      toConfirm: counts.pending,
      inProgress: counts.confirmed + counts.out_for_delivery,
      deliveredToday: deliveredToday.length,
      salesToday: round2(deliveredToday.reduce((s, o) => s + Number(o.total_amount), 0))
    },
    orders: orders.map((o) => ({ ...toView(o), customer: `${o.Customer.first_name} ${o.Customer.last_name}` }))
  };
}

export async function getForAdmin(orderCode) {
  const o = await Order.findOne({ where: { order_code: orderCode }, include: [safeCustomer, OrderItem] });
  if (!o) return null;
  const c = o.Customer;
  return { ...toView(o), customer: { name: `${c.first_name} ${c.last_name}`, customer_code: c.customer_code, email: c.email, phone: c.phone } };
}

// --- Sales report (DFD process 7, use case "View sales report") ------------------------
// A sale counts on the day it was delivered, the same date Accounting posts it.
// +salesSummary(dateFrom, dateTo)
export async function salesSummary(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00+08:00`);
  const to = new Date(`${toDate}T23:59:59.999+08:00`);
  const orders = await Order.findAll({
    where: { delivered_at: { [Op.between]: [from, to] }, order_status: { [Op.in]: ["delivered", "returned"] } },
    include: OrderItem,
    order: [["delivered_at", "ASC"]]
  });
  const placed = await Order.findAll({ where: { ordered_at: { [Op.between]: [from, to] } }, attributes: ["order_status"], raw: true });

  const sold = orders.filter((o) => o.order_status === "delivered");
  const returned = orders.filter((o) => o.order_status === "returned");
  const sum = (list, f) => round2(list.reduce((s, o) => s + Number(o[f]), 0));

  const byDay = {};
  for (const o of sold) {
    const d = manilaDate(o.delivered_at);
    byDay[d] ??= { date: d, orders: 0, sales: 0 };
    byDay[d].orders += 1;
    byDay[d].sales = round2(byDay[d].sales + Number(o.total_amount));
  }
  const byProduct = {};
  for (const o of sold) for (const i of o.OrderItems) {
    byProduct[i.product_name] ??= { name: i.product_name, quantity: 0, sales: 0 };
    byProduct[i.product_name].quantity += i.quantity;
    byProduct[i.product_name].sales = round2(byProduct[i.product_name].sales + Number(i.line_total));
  }
  const byMethod = ["cod", "gcash"].map((m) => {
    const list = sold.filter((o) => o.payment_method === m);
    return { method: m, orders: list.length, sales: sum(list, "total_amount") };
  });

  return {
    from: fromDate,
    to: toDate,
    deliveredOrders: sold.length,
    productSales: sum(sold, "subtotal"),
    deliveryFees: sum(sold, "shipping_fee"),
    totalSales: sum(sold, "total_amount"),
    returnedOrders: returned.length,
    refunds: sum(returned, "total_amount"),
    placedByStatus: ORDER_STATUSES.map((s) => ({ status: s, n: placed.filter((o) => o.order_status === s).length })),
    days: Object.values(byDay),
    products: Object.values(byProduct).sort((a, b) => b.sales - a.sales),
    methods: byMethod
  };
}
