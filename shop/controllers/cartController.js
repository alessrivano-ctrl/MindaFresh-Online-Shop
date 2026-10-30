// Cart: cart_items keeps product_id + quantity only. Prices and stock are read live.
import { Product, StockLevel, CartItem } from "../models/index.js";
import { getCart } from "../services/orderService.js";

// Go back to the page the customer was on (path only, so it always stays inside the Shop)
const back = (req, fallback = "/cart") => {
  try {
    const url = new URL(req.get("Referer"));
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
};

export const cartPage = async (req, res, next) => {
  try {
    const cart = await getCart(req.session.customer.id);
    res.render("cart", { title: "Your cart", cart });
  } catch (err) {
    next(err);
  }
};

export const addToCart = async (req, res, next) => {
  try {
    const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    const product = await Product.findOne({
      where: { product_code: req.body.product_code, is_online: true, status: "active" },
      include: StockLevel
    });
    if (!product) {
      req.flash("error_msg", "That product is not available online.");
      return res.redirect(back(req, "/"));
    }
    const stock = product.StockLevel?.quantity_on_hand ?? 0;
    const existing = await CartItem.findOne({ where: { customer_id: req.session.customer.id, product_id: product.id } });
    const wanted = (existing?.quantity ?? 0) + quantity;

    if (stock === 0) {
      req.flash("error_msg", `${product.name} is out of stock.`);
      return res.redirect(back(req, "/"));
    }
    if (wanted > stock) {
      req.flash("error_msg", `Only ${stock} left of ${product.name}.`);
      return res.redirect(back(req, "/"));
    }

    if (existing) await existing.update({ quantity: wanted });
    else await CartItem.create({ customer_id: req.session.customer.id, product_id: product.id, quantity });

    req.flash("success_msg", `Added ${quantity} × ${product.name} to your cart.`);
    res.redirect(req.body.buy_now ? "/checkout" : back(req, "/"));
  } catch (err) {
    next(err);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const item = await CartItem.findOne({
      where: { id: req.params.id, customer_id: req.session.customer.id },
      include: { model: Product, include: StockLevel }
    });
    if (!item) return res.redirect("/cart");

    let quantity = parseInt(req.body.quantity, 10);
    if (req.body.step === "up") quantity = item.quantity + 1;
    if (req.body.step === "down") quantity = item.quantity - 1;
    if (!Number.isFinite(quantity)) return res.redirect("/cart");

    if (quantity <= 0) {
      await item.destroy();
      req.flash("success_msg", `Removed ${item.Product.name}.`);
      return res.redirect("/cart");
    }
    const stock = item.Product.StockLevel?.quantity_on_hand ?? 0;
    if (quantity > stock) {
      req.flash("error_msg", `Only ${stock} left of ${item.Product.name}.`);
      quantity = Math.max(stock, 0);
      if (quantity === 0) { await item.destroy(); return res.redirect("/cart"); }
    }
    await item.update({ quantity });
    res.redirect("/cart");
  } catch (err) {
    next(err);
  }
};

export const removeCartItem = async (req, res, next) => {
  try {
    const item = await CartItem.findOne({ where: { id: req.params.id, customer_id: req.session.customer.id }, include: Product });
    if (item) {
      await item.destroy();
      req.flash("success_msg", `Removed ${item.Product.name}.`);
    }
    res.redirect("/cart");
  } catch (err) {
    next(err);
  }
};
