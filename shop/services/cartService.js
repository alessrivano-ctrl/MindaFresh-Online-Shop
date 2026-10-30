// shop/services/cartService.js — CartService (class diagram, Figure 2)
// cart_items keeps product_id + quantity only. Prices and stock are always read live from POS's tables.
import { Product, Category, StockLevel, CartItem } from "../models/index.js";
import { AppError } from "../utils/appError.js";
import { round2 } from "../utils/money.js";

export const shippingFee = () => round2(Number(process.env.SHIPPING_FEE ?? 50));

// The cart with live prices and stock, for the cart and checkout pages
export async function getCart(customerId) {
  const rows = await CartItem.findAll({
    where: { customer_id: customerId },
    include: [{ model: Product, include: [StockLevel, Category] }],
    order: [["created_at", "ASC"]]
  });
  const items = rows.map((r) => {
    const p = r.Product;
    const stock = p.StockLevel?.quantity_on_hand ?? 0;
    const price = Number(p.selling_price);
    const available = p.status === "active" && p.is_online;
    return {
      id: r.id,
      product_code: p.product_code,
      name: p.name,
      category: p.Category?.name,
      unit: p.unit,
      image_url: p.image_url,
      price,
      quantity: r.quantity,
      line_total: round2(price * r.quantity),
      stock,
      short: available && r.quantity > stock, // more in the cart than we have
      unavailable: !available
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const fee = items.length ? shippingFee() : 0;
  return { items, subtotal, shipping_fee: fee, total: round2(subtotal + fee), count,
           hasProblem: items.some((i) => i.short || i.unavailable) };
}

// Number shown on the cart badge
export async function countItems(customerId) {
  return (await CartItem.sum("quantity", { where: { customer_id: customerId } })) || 0;
}

// Add to cart, never more than the stock on hand
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

// Change a quantity: an exact number, or step "up" / "down". Zero removes the item.
export async function updateItem(customerId, itemId, { quantity, step }) {
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

export async function removeItem(customerId, itemId) {
  const item = await CartItem.findOne({ where: { id: itemId, customer_id: customerId }, include: Product });
  if (!item) return null;
  await item.destroy();
  return `Removed ${item.Product.name}.`;
}

// Checkout reads the cart and clears it inside the order's transaction
export function itemsForCheckout(customerId, t) {
  return CartItem.findAll({ where: { customer_id: customerId }, include: Product, transaction: t });
}

export function clear(customerId, t) {
  return CartItem.destroy({ where: { customer_id: customerId }, transaction: t });
}
