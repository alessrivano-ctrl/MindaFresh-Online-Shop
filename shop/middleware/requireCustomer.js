// Shop only: pages that need a logged-in customer (cart, checkout, my orders, profile).
// A customer the admin has disabled is logged out on their next click.
import { isActive } from "../services/customerService.js";

export const requireCustomer = async (req, res, next) => {
  try {
    if (req.session.customer) {
      if (await isActive(req.session.customer.id)) return next();
      delete req.session.customer;
      req.flash("error_msg", "This account is disabled. Please contact the store.");
      return res.redirect("/login");
    }
    req.session.returnTo = req.method === "GET" ? req.originalUrl : (req.get("Referer") || "/");
    req.flash("error_msg", "Please log in first.");
    res.redirect("/login");
  } catch (err) {
    next(err);
  }
};
