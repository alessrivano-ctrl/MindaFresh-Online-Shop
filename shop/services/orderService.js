// shop/services/orderService.js — Shop only (not shared). Blueprint Section 7, flow A.
// Golden rule: an order and its stock change happen in ONE transaction, so there is never half an order.
import { sequelize, Product, Category, StockLevel, CartItem, Order, OrderItem, Customer } from "../models/index.js";
import { deductStock, returnStock } from "./stockService.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";

const shippingFee = () => round2(Number(process.env.SHIPPING_FEE ?? 50));

// Next step in the delivery flow, for the admin's main button
export const NEXT_STATUS = { pending: "confirmed", confirmed: "out_for_delivery", out_for_delivery: "delivered" };
export const CUSTOMER_CAN_CANCEL = ["pending"];
export const ADMIN_CAN_CANCEL = ["pending", "confirmed", "out_for_delivery"];

// Checkout: create the order, deduct stock through POS's stockService, save items with snapshots, clear the cart.
export async function placeOrder(customerId, { payment_method, address, city, phone }) {
  if (!["cod", "gcash"].includes(payment_method))
    throw new AppError("VALIDATION_ERROR", "Please choose cash on delivery or GCash.");
  address = (address || "").trim();
  city = (city || "").trim();
  if (!address || !city) throw new AppError("VALIDATION_ERROR", "Please enter your delivery address and city.");
  const delivery_address = `${address}, ${city}`.slice(0, 255);

  return sequelize.transaction(async (t) => {
    const cart = await CartItem.findAll({ where: { customer_id: customerId }, include: Product, transaction: t });
    if (!cart.length) throw new AppError("VALIDATION_ERROR", "Your cart is empty.");

    for (const item of cart) {
      if (!item.Product || item.Product.status !== "active" || !item.Product.is_online)
        throw new AppError("PRODUCT_UNAVAILABLE", `${item.Product?.name ?? "A product"} is no longer sold online. Please remove it from your cart.`);
    }

    // Live prices from POS's products table (never from the cart)
    const lines = cart.map((item) => ({
      product_id: item.product_id,
      product_name: item.Product.name,
      quantity: item.quantity,
      unit_price: Number(item.Product.selling_price),
      line_total: round2(Number(item.Product.selling_price) * item.quantity)
    }));
    const subtotal = round2(lines.reduce((sum, l) => sum + l.line_total, 0));
    const shipping_fee = shippingFee();

    const order = await Order.create({
      customer_id: customerId,
      subtotal,
      shipping_fee,
      total_amount: round2(subtotal + shipping_fee),
      total_cost: 0,
      payment_method,
      payment_status: payment_method === "gcash" ? "paid" : "unpaid",
      order_status: "pending",
      delivery_address,
      ordered_at: new Date()
    }, { transaction: t });

    // Throws INSUFFICIENT_STOCK ("Only 2 left of Calamansi 1kg Pack.") and rolls everything back
    const deducted = await deductStock({ items: lines.map(({ product_id, quantity }) => ({ product_id, quantity })), order_id: order.id }, t);
    const costOf = Object.fromEntries(deducted.map((d) => [d.product_id, Number(d.unit_cost)]));

    await OrderItem.bulkCreate(lines.map((l) => ({ ...l, order_id: order.id, unit_cost: costOf[l.product_id] })), { transaction: t });
    order.total_cost = round2(lines.reduce((sum, l) => sum + l.quantity * costOf[l.product_id], 0));
    await order.save({ transaction: t });

    await CartItem.destroy({ where: { customer_id: customerId }, transaction: t });

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

// Admin: pending → confirmed → out_for_delivery → delivered
export async function advanceOrder(orderCode) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t);
    const next = NEXT_STATUS[order.order_status];
    if (!next) throw new AppError("VALIDATION_ERROR", `A ${order.order_status.replaceAll("_", " ")} order cannot move forward.`);
    order.order_status = next;
    if (next === "delivered") {
      order.payment_status = "paid";  // COD is collected by the rider; GCash was already paid
      order.delivered_at = new Date(); // Accounting posts the sale on delivery
    }
    await order.save({ transaction: t });
    return order;
  });
}

// Cancelled before delivery: return the stock, refund GCash. No accounting entry (a sale is posted only on delivery).
export async function cancelOrder(orderCode, { customerId = null, employeeId = null } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t, customerId);
    const allowed = customerId ? CUSTOMER_CAN_CANCEL : ADMIN_CAN_CANCEL;
    if (!allowed.includes(order.order_status)) {
      throw new AppError("VALIDATION_ERROR", customerId
        ? "This order is already confirmed, so it can no longer be cancelled here. Please contact the store."
        : `A ${order.order_status.replaceAll("_", " ")} order cannot be cancelled.`);
    }
    order.order_status = "cancelled";
    if (order.payment_status === "paid") order.payment_status = "refunded";
    await order.save({ transaction: t });
    await returnStock({ order_id: order.id, employee_id: employeeId }, t);
    return order;
  });
}

// Returned after delivery: refund and return the stock. Accounting posts a reversal.
export async function returnOrder(orderCode, { employeeId = null } = {}) {
  return sequelize.transaction(async (t) => {
    const order = await lockOrder(orderCode, t);
    if (order.order_status !== "delivered") throw new AppError("VALIDATION_ERROR", "Only a delivered order can be returned.");
    order.order_status = "returned";
    order.payment_status = "refunded";
    await order.save({ transaction: t });
    await returnStock({ order_id: order.id, employee_id: employeeId }, t);
    return order;
  });
}

// Cart rows with live product data, for the cart and checkout pages
export async function getCart(customerId) {
  const rows = await CartItem.findAll({
    where: { customer_id: customerId },
    include: [{ model: Product, include: [StockLevel, Category] }],
    order: [["created_at", "ASC"]]
  });
  const items = rows.map((r) => {
    const p = r.Product;
    const stock = p.StockLevel?.quantity_on_hand ?? 0;
    const price = Number(p.selling_price);
    const available = p.status === "active" && p.is_online;
    return {
      id: r.id,
      product_code: p.product_code,
      name: p.name,
      category: p.Category?.name,
      unit: p.unit,
      image_url: p.image_url,
      price,
      quantity: r.quantity,
      line_total: round2(price * r.quantity),
      stock,
      available,
      short: available && r.quantity > stock, // more in the cart than we have
      unavailable: !available
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const fee = items.length ? shippingFee() : 0;
  return { items, subtotal, shipping_fee: fee, total: round2(subtotal + fee), count, hasProblem: items.some((i) => i.short || i.unavailable) };
}
