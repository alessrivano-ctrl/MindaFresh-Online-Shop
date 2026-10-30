// Customer register / login / logout. Customers log in only to the Shop, against the customers table
// (email + bcrypt password). They are kept in req.session.customer, separate from staff (req.session.user).
import bcrypt from "bcrypt";
import { Customer } from "../models/index.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loginPage = (req, res) => {
  if (req.session.customer) return res.redirect("/");
  res.render("login", { title: "Log in" });
};

export const registerPage = (req, res) => {
  if (req.session.customer) return res.redirect("/");
  res.render("register", { title: "Create account", form: {} });
};

function startSession(req, customer) {
  req.session.customer = {
    id: customer.id,
    customer_code: customer.customer_code,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    initials: `${customer.first_name[0] ?? ""}${customer.last_name[0] ?? ""}`.toUpperCase()
  };
}

function goBack(req, res) {
  const to = req.session.returnTo || "/";
  delete req.session.returnTo;
  res.redirect(to);
}

export const loginCustomer = async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const customer = await Customer.findOne({ where: { email } });
    if (!customer || !(await bcrypt.compare(password, customer.password))) {
      req.flash("error_msg", "Wrong email or password.");
      return res.redirect("/login");
    }
    if (customer.status !== "active") {
      req.flash("error_msg", "This account is disabled. Please contact the store.");
      return res.redirect("/login");
    }
    startSession(req, customer);
    req.flash("success_msg", `Welcome back, ${customer.first_name}!`);
    goBack(req, res);
  } catch (err) {
    next(err);
  }
};

export const registerCustomer = async (req, res, next) => {
  try {
    const form = {
      first_name: (req.body.first_name || "").trim(),
      last_name: (req.body.last_name || "").trim(),
      email: (req.body.email || "").trim().toLowerCase(),
      phone: (req.body.phone || "").trim(),
      address: (req.body.address || "").trim(),
      city: (req.body.city || "Calapan City").trim()
    };
    const password = req.body.password || "";
    const errors = [];
    if (!form.first_name || !form.last_name) errors.push("Please enter your first and last name.");
    if (!EMAIL.test(form.email)) errors.push("Please enter a valid email address.");
    if (password.length < 8) errors.push("Your password needs at least 8 characters.");
    if (password !== req.body.confirm_password) errors.push("The two passwords do not match.");
    if (!errors.length && (await Customer.findOne({ where: { email: form.email } })))
      errors.push("An account with this email already exists. Please log in.");

    if (errors.length) {
      return res.status(400).render("register", { title: "Create account", form, error_msg: errors });
    }

    const customer = await Customer.create({
      ...form,
      phone: form.phone || null,
      address: form.address || null,
      password: await bcrypt.hash(password, 10),
      status: "active"
    });
    startSession(req, customer);
    req.flash("success_msg", `Welcome to MindaFresh, ${customer.first_name}! Your account is ${customer.customer_code}.`);
    goBack(req, res);
  } catch (err) {
    next(err);
  }
};

export const logoutCustomer = (req, res) => {
  delete req.session.customer;
  delete req.session.returnTo;
  res.redirect("/");
};
