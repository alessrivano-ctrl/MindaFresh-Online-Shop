// orderController — use cases "View and track orders", "Cancel pending order"
import * as orderService from "../services/orderService.js";
import { AppError } from "../utils/appError.js";

// The 4 steps of the tracker; cancelled and returned orders show a banner instead
const STEPS = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" }
];

function trackerSteps(status) {
  const at = STEPS.findIndex((s) => s.key === status);
  return STEPS.map((s, i) => ({ ...s, n: i + 1, done: at >= 0 && i <= at, current: i === at, last: i === STEPS.length - 1 }));
}

// GET /orders
export const list = async (req, res, next) => {
  try {
    res.render("orders", { title: "My orders", orders: await orderService.listForCustomer(req.session.customer.id) });
  } catch (err) {
    next(err);
  }
};

// GET /orders/:code
export const show = async (req, res, next) => {
  try {
    const order = await orderService.getForCustomer(req.session.customer.id, req.params.code);
    if (!order) {
      return res.status(404).render("error", { title: "Order not found", heading: "Order not found",
        message: "We couldn't find that order in your account." });
    }
    res.render("order", {
      title: `Order ${order.order_code}`,
      order,
      steps: trackerSteps(order.order_status),
      stopped: ["cancelled", "returned"].includes(order.order_status),
      canCancel: orderService.CUSTOMER_CAN_CANCEL.includes(order.order_status)
    });
  } catch (err) {
    next(err);
  }
};

// POST /orders/:code/cancel
export const cancel = async (req, res, next) => {
  try {
    const order = await orderService.cancel(req.params.code, { customerId: req.session.customer.id });
    req.flash("success_msg", `Order ${order.order_code} was cancelled.${order.payment_status === "refunded" ? " Your GCash payment will be refunded." : ""}`);
  } catch (err) {
    if (!(err instanceof AppError)) return next(err);
    req.flash("error_msg", err.message);
  }
  res.redirect(`/orders/${req.params.code}`);
};
