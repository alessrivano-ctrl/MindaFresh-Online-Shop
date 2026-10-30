// adminCustomerController — use case "Manage customer accounts" (Admin)
import * as customerService from "../services/customerService.js";
import { AppError } from "../utils/appError.js";

// GET /admin/customers
export const list = async (req, res, next) => {
  try {
    res.render("admin-customers", { title: "Customers", nav: "customers", customers: await customerService.list() });
  } catch (err) {
    next(err);
  }
};

// POST /admin/customers/:code/status — enable or disable an account
export const setStatus = async (req, res, next) => {
  try {
    const c = await customerService.setStatus(req.params.code, req.body.status);
    req.flash("success_msg", `${c.first_name} ${c.last_name} (${c.customer_code}) is now ${c.status === "active" ? "enabled" : "disabled"}.`);
  } catch (err) {
    if (!(err instanceof AppError)) return next(err);
    req.flash("error_msg", err.message);
  }
  res.redirect("/admin/customers");
};
