// MindaFresh Online Shop — routes
import express from "express";
import { requireRole } from "../middleware/requireRole.js";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { homePage, productPage } from "../controllers/shopController.js";
import { loginPage, registerPage, loginCustomer, registerCustomer, logoutCustomer } from "../controllers/authController.js";
import { cartPage, addToCart, updateCartItem, removeCartItem } from "../controllers/cartController.js";
import { checkoutPage, placeOrderAction } from "../controllers/checkoutController.js";
import { ordersPage, orderPage, cancelOrderAction } from "../controllers/orderController.js";
import * as admin from "../controllers/adminController.js";

const router = express.Router();

// Storefront (anyone)
router.get("/", homePage);
router.get("/products/:code", productPage);

// Customer accounts (customers table)
router.get("/login", loginPage);
router.post("/login", loginCustomer);
router.get("/register", registerPage);
router.post("/register", registerCustomer);
router.get("/logout", logoutCustomer);
router.get("/dashboard", requireCustomer, (req, res) => res.redirect("/orders"));

// Cart and checkout (logged-in customer)
router.get("/cart", requireCustomer, cartPage);
router.post("/cart/add", requireCustomer, addToCart);
router.post("/cart/:id/update", requireCustomer, updateCartItem);
router.post("/cart/:id/remove", requireCustomer, removeCartItem);
router.get("/checkout", requireCustomer, checkoutPage);
router.post("/checkout", requireCustomer, placeOrderAction);

// My orders
router.get("/orders", requireCustomer, ordersPage);
router.get("/orders/:code", requireCustomer, orderPage);
router.post("/orders/:code/cancel", requireCustomer, cancelOrderAction);

// Shop admin (staff: users ⨝ employees)
router.get("/admin", (req, res) => res.redirect("/admin/orders"));
router.get("/admin/login", admin.loginPage);
router.post("/admin/login", admin.loginStaff);
router.get("/admin/logout", admin.logoutStaff);
router.get("/admin/orders", requireRole("admin", "accountant"), admin.ordersPage);
router.get("/admin/orders/:code", requireRole("admin", "accountant"), admin.orderPage);
router.post("/admin/orders/:code/advance", requireRole("admin"), admin.advanceAction);
router.post("/admin/orders/:code/cancel", requireRole("admin"), admin.cancelAction);
router.post("/admin/orders/:code/return", requireRole("admin"), admin.returnAction);
router.get("/admin/customers", requireRole("admin"), admin.customersPage);
router.get("/admin/products", requireRole("admin"), admin.productsPage);

export default router;
