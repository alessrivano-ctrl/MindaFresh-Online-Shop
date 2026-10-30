// cartController — use case "Manage cart" (CartService)
import * as cartService from "../services/cartService.js";
import { AppError } from "../utils/appError.js";

// Go back to the page the customer was on (path only, so it always stays inside the Shop)
const back = (req, fallback = "/cart") => {
  try {
    const url = new URL(req.get("Referer"));
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
};

// Runs a cart action and shows its message, or the error's message, with a SweetAlert
const run = (action, where) => async (req, res, next) => {
  try {
    const msg = await action(req);
    if (msg) req.flash("success_msg", msg);
  } catch (err) {
    if (!(err instanceof AppError)) return next(err);
    req.flash("error_msg", err.message);
    return res.redirect(back(req, "/"));
  }
  res.redirect(where(req));
};

// GET /cart
export const view = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.session.customer.id);
    res.render("cart", { title: "Your cart", cart });
  } catch (err) {
    next(err);
  }
};

// POST /cart/add
export const add = run(
  (req) => cartService.addItem(req.session.customer.id, req.body.product_code, req.body.quantity),
  (req) => (req.body.buy_now ? "/checkout" : back(req, "/"))
);

// POST /cart/:id/update
export const update = run(
  (req) => cartService.updateQty(req.session.customer.id, req.params.id, req.body),
  () => "/cart"
);

// POST /cart/:id/remove
export const remove = run(
  (req) => cartService.removeItem(req.session.customer.id, req.params.id),
  () => "/cart"
);
