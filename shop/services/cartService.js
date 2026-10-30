// shop/services/cartService.js — CartService (class diagram, Figure 2)
// cart_items keeps product_id + quantity only. Prices and stock are always read live from POS's tables.
import { Product, Category, StockLevel, CartItem } from "../models/index.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";

export const shippingFee = () => round2(Number(process.env.SHIPPING_FEE ?? 50));

// +getCart(customerId): the cart with live prices and stock, for the cart page, checkout
// and OrderService.placeOrder (pass the transaction t when called inside checkout)
export async function getCart(customerId, t = null) {
  const rows = await CartItem.findAll({
    where: { customer_id: customerId },
    include: [{ model: Product, include: [StockLevel, Category] }],
    order: [["created_at", "ASC"]],
    transaction: t
  });
  const items = rows.map((r) => {
    const p = r.Product;
    const stock = p.StockLevel?.quantity_on_hand ?? 0;
    const price = Number(p.selling_price);
    const available = p.status === "active" && Boolean(p.is_online);
    return {
      id: r.id,
      product_id: p.id,
      product_code: p.product_code,
      name: p.name,
      category: p.Category?.name,
      unit: p.unit,
      image_url: p.image_url,
      price,
      quantity: r.quantity,
      line_total: r.lineTotal(price),
      stock,
      short: available && !p.isAvailable(r.quantity), // more in the cart than we have
      unavailable: !available
    };
  });
  return { items, ...computeTotals(items), hasProblem: items.some((i) => i.short || i.unavailable) };
}

// +computeTotals(items): subtotal + shipping fee (₱50 from .env) = total, rounded with round2()
export function computeTotals(items) {
  const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const shipping_fee = items.length ? shippingFee() : 0;
  return { subtotal, shipping_fee, total: round2(subtotal + shipping_fee), count: items.reduce((s, i) => s + i.quantity, 0) };
}

// Number shown on the cart badge
export async function countItems(customerId) {
  return (await CartItem.sum("quantity", { where: { customer_id: customerId } })) || 0;
}

// +addItem(customerId, productCode, qty): add to cart, never more than the stock on hand
export async function addItem(customerId, productCode, quantity) {
  quantity = Math.max(1, parseInt(quantity, 10) || 1);
  const product = await Product.findOne({
    where: { product_code: productCode, is_online: true, status: "active" },
    include: StockLevel
  });
  if (!product) throw new AppError("PRODUCT_UNAVAILABLE", "That product is not available online.");
  const stock = product.StockLevel?.quantity_on_hand ?? 0;
  if (stock === 0) throw new AppError("INSUFFICIENT_STOCK", `${product.name} is out of stock.`);

  const existing = await CartItem.findOne({ where: { customer_id: customerId, product_id: product.id } });
  const wanted = (existing?.quantity ?? 0) + quantity;
  if (wanted > stock) throw new AppError("INSUFFICIENT_STOCK", `Only ${stock} left of ${product.name}.`);

  if (existing) await existing.update({ quantity: wanted });
  else await CartItem.create({ customer_id: customerId, product_id: product.id, quantity });
  return `Added ${quantity} × ${product.name} to your cart.`;
}

// +updateQty(customerId, cartItemId, { quantity | step }): an exact number, or step "up" / "down". Zero removes the item.
export async function updateQty(customerId, itemId, { quantity, step }) {
  const item = await CartItem.findOne({
    where: { id: itemId, customer_id: customerId },
    include: { model: Product, include: StockLevel }
  });
  if (!item) return null;

  let qty = parseInt(quantity, 10);
  if (step === "up") qty = item.quantity + 1;
  if (step === "down") qty = item.quantity - 1;
  if (!Number.isFinite(qty)) return null;

  if (qty <= 0) {
    await item.destroy();
    return `Removed ${item.Product.name}.`;
  }
  const stock = item.Product.StockLevel?.quantity_on_hand ?? 0;
  if (qty > stock) {
    if (stock === 0) await item.destroy();
    else await item.update({ quantity: stock });
    throw new AppError("INSUFFICIENT_STOCK", `Only ${stock} left of ${item.Product.name}.`);
  }
  await item.update({ quantity: qty });
  return null;
}

// +removeItem(customerId, cartItemId)
export async function removeItem(customerId, itemId) {
  const item = await CartItem.findOne({ where: { id: itemId, customer_id: customerId }, include: Product });
  if (!item) return null;
  await item.destroy();
  return `Removed ${item.Product.name}.`;
}

// Checkout clears the cart inside the order's transaction
export function clear(customerId, t) {
  return CartItem.destroy({ where: { customer_id: customerId }, transaction: t });
}
