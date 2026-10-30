// shop/services/customerService.js — CustomerService (class diagram, Figure 2)
// Customers log in only to the Shop, against the customers table (email + bcrypt password).
import bcrypt from "bcrypt";
import { Customer, Order } from "../models/index.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^09\d{9}$/;

// What the app keeps in req.session.customer
export function toSession(c) {
  return {
    id: c.id,
    customer_code: c.customer_code,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    initials: `${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()
  };
}

function cleanProfile(body) {
  return {
    first_name: (body.first_name || "").trim(),
    last_name: (body.last_name || "").trim(),
    phone: (body.phone || "").trim(),
    address: (body.address || "").trim(),
    city: (body.city || "").trim()
  };
}

function profileErrors(p) {
  const errors = [];
  if (!p.first_name || !p.last_name) errors.push("Please enter your first and last name.");
  if (p.phone && !PHONE.test(p.phone)) errors.push("Mobile number must be 11 digits starting with 09.");
  return errors;
}

function validationError(errors) {
  const err = new AppError("VALIDATION_ERROR", errors.join(" "));
  err.details = errors;
  return err;
}

export async function register(body) {
  const form = { ...cleanProfile(body), email: (body.email || "").trim().toLowerCase() };
  if (!form.city) form.city = "Calapan City";
  const password = body.password || "";
  const errors = profileErrors(form);
  if (!EMAIL.test(form.email)) errors.push("Please enter a valid email address.");
  if (password.length < 8) errors.push("Your password needs at least 8 characters.");
  if (password !== body.confirm_password) errors.push("The two passwords do not match.");
  if (!errors.length && (await Customer.findOne({ where: { email: form.email } })))
    errors.push("An account with this email already exists. Please log in.");
  if (errors.length) {
    const err = validationError(errors);
    err.form = form;
    throw err;
  }
  return Customer.create({
    ...form,
    phone: form.phone || null,
    address: form.address || null,
    password: await bcrypt.hash(password, 10),
    status: "active"
  });
}

export async function login(email, password) {
  const customer = await Customer.findOne({ where: { email: (email || "").trim().toLowerCase() } });
  if (!customer || !(await bcrypt.compare(password || "", customer.password)))
    throw new AppError("INVALID_LOGIN", "Wrong email or password.");
  if (customer.status !== "active")
    throw new AppError("ACCOUNT_DISABLED", "This account is disabled. Please contact the store.");
  return customer;
}

export async function isActive(id) {
  const c = await Customer.findByPk(id, { attributes: ["status"] });
  return c?.status === "active";
}

export async function getProfile(id) {
  const c = await Customer.findByPk(id, { attributes: { exclude: ["password"] } });
  return c && c.get({ plain: true });
}

export async function updateProfile(id, body) {
  const p = cleanProfile(body);
  const errors = profileErrors(p);
  if (errors.length) throw validationError(errors);
  const c = await Customer.findByPk(id);
  await c.update({ ...p, phone: p.phone || null, address: p.address || null, city: p.city || null });
  return c;
}

export async function changePassword(id, { current_password, new_password, confirm_password }) {
  const c = await Customer.findByPk(id);
  if (!(await bcrypt.compare(current_password || "", c.password)))
    throw validationError(["Your current password is wrong."]);
  if ((new_password || "").length < 8) throw validationError(["Your new password needs at least 8 characters."]);
  if (new_password !== confirm_password) throw validationError(["The two new passwords do not match."]);
  await c.update({ password: await bcrypt.hash(new_password, 10) });
}

// Admin: all customers with their order count and delivered total
export async function list() {
  const customers = await Customer.findAll({ include: Order, order: [["id", "ASC"]] });
  return customers.map((c) => ({
    customer_code: c.customer_code,
    name: `${c.first_name} ${c.last_name}`,
    email: c.email,
    phone: c.phone,
    city: c.city,
    status: c.status,
    orders: c.Orders.length,
    spent: round2(c.Orders.filter((o) => o.order_status === "delivered").reduce((s, o) => s + Number(o.total_amount), 0))
  }));
}

// Admin: enable or disable an account. A disabled customer cannot log in or check out.
export async function setStatus(customerCode, status) {
  if (!["active", "disabled"].includes(status)) throw new AppError("VALIDATION_ERROR", "Unknown status.");
  const c = await Customer.findOne({ where: { customer_code: customerCode } });
  if (!c) throw new AppError("VALIDATION_ERROR", "Customer not found.");
  await c.update({ status });
  return c;
}
