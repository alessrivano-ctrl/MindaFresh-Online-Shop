// Customer: my orders, order details with tracking, cancel while pending.
import { Order, OrderItem, Product } from "../models/index.js";
import { cancelOrder, CUSTOMER_CAN_CANCEL } from "../services/orderService.js";
import { AppError } from "../utils/appError.js";

// The 4 steps of the tracker; cancelled and returned orders show a banner instead
const STEPS = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" }
];

export function trackerSteps(status) {
  const at = STEPS.findIndex((s) => s.key === status);
  return STEPS.map((s, i) => ({ ...s, n: i + 1, done: at >= 0 && i <= at, current: i === at, last: i === STEPS.length - 1 }));
}

export const ordersPage = async (req, res, next) => {
  try {
    const orders = await Order.findAll({
      where: { customer_id: req.session.customer.id },
      include: OrderItem,
      order: [["ordered_at", "DESC"]]
    });
    res.render("orders", {
      title: "My orders",
      orders: orders.map((o) => ({
        order_code: o.order_code,
        ordered_at: o.ordered_at,
        order_status: o.order_status,
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        total_amount: Number(o.total_amount),
        itemCount: o.OrderItems.reduce((s, i) => s + i.quantity, 0),
        summary: o.OrderItems.map((i) => `${i.quantity} × ${i.product_name}`).join(", ")
      }))
    });
  } catch (err) {
    next(err);
  }
};

export const orderPage = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { order_code: req.params.code, customer_id: req.session.customer.id },
      include: { model: OrderItem, include: Product }
    });
    if (!order) {
      return res.status(404).render("error", { title: "Order not found", heading: "Order not found",
        message: "We couldn't find that order in your account." });
    }
    res.render("order", {
      title: `Order ${order.order_code}`,
      order: {
        ...order.get({ plain: true }),
        subtotal: Number(order.subtotal),
        shipping_fee: Number(order.shipping_fee),
        total_amount: Number(order.total_amount),
        items: order.OrderItems.map((i) => ({
          product_name: i.product_name,
          product_code: i.Product?.product_code,
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          line_total: Number(i.line_total)
        }))
      },
      steps: trackerSteps(order.order_status),
      stopped: ["cancelled", "returned"].includes(order.order_status),
      canCancel: CUSTOMER_CAN_CANCEL.includes(order.order_status)
    });
  } catch (err) {
    next(err);
  }
};

export const cancelOrderAction = async (req, res, next) => {
  try {
    const order = await cancelOrder(req.params.code, { customerId: req.session.customer.id });
    req.flash("success_msg", `Order ${order.order_code} was cancelled.${order.payment_status === "refunded" ? " Your GCash payment will be refunded." : ""}`);
    res.redirect(`/orders/${order.order_code}`);
  } catch (err) {
    if (err instanceof AppError) {
      req.flash("error_msg", err.message);
      return res.redirect(`/orders/${req.params.code}`);
    }
    next(err);
  }
};
