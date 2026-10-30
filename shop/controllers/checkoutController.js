// Checkout: one transaction for order + stock + items + clearing the cart (orderService.placeOrder).
import { Customer } from "../models/index.js";
import { getCart, placeOrder } from "../services/orderService.js";
import { AppError } from "../utils/appError.js";

export const checkoutPage = async (req, res, next) => {
  try {
    const cart = await getCart(req.session.customer.id);
    if (!cart.items.length) {
      req.flash("error_msg", "Your cart is empty.");
      return res.redirect("/");
    }
    if (cart.hasProblem) {
      req.flash("error_msg", "Some items in your cart need your attention first.");
      return res.redirect("/cart");
    }
    const c = await Customer.findByPk(req.session.customer.id);
    res.render("checkout", {
      title: "Checkout",
      cart,
      form: {
        name: `${c.first_name} ${c.last_name}`,
        phone: c.phone || "",
        address: c.address || "",
        city: c.city || "Calapan City",
        payment_method: "cod"
      }
    });
  } catch (err) {
    next(err);
  }
};

export const placeOrderAction = async (req, res, next) => {
  try {
    const order = await placeOrder(req.session.customer.id, {
      payment_method: req.body.payment_method,
      address: req.body.address,
      city: req.body.city,
      phone: req.body.phone
    });
    req.flash("success_msg", "Order placed! We'll text you when it's on the way.");
    res.redirect(`/orders/${order.order_code}`);
  } catch (err) {
    if (err instanceof AppError) {
      // Nothing was saved (the transaction rolled back). Show why.
      req.flash("error_msg", err.message);
      return res.redirect(err.code === "VALIDATION_ERROR" && err.message !== "Your cart is empty." ? "/checkout" : "/cart");
    }
    next(err);
  }
};
