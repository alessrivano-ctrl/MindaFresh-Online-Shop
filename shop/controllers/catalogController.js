// catalogController — browse and search products (use cases "Browse products", "Search", "View product details")
// Reads POS's tables directly (products ⨝ stock_levels), only is_online = 1 and status = 'active'.
// cost_price is never sent to a view.
import { Op } from "sequelize";
import { Product, Category, StockLevel } from "../models/index.js";

const LOW_STOCK = 10;
const onlineWhere = { is_online: true, status: "active" };

function toCard(p) {
  const stock = p.StockLevel?.quantity_on_hand ?? 0;
  return {
    product_code: p.product_code,
    name: p.name,
    description: p.description,
    category: p.Category?.name,
    category_code: p.Category?.category_code,
    unit: p.unit,
    price: Number(p.selling_price),
    image_url: p.image_url,
    stock,
    inStock: stock > 0,
    lowStock: stock > 0 && stock <= LOW_STOCK
  };
}

// GET /  — product list with category filter and search
export const index = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const categoryCode = req.query.category || "";
    const categories = await Category.findAll({ order: [["id", "ASC"]] });
    const active = categories.find((c) => c.category_code === categoryCode);

    const where = { ...onlineWhere };
    if (q) where.name = { [Op.like]: `%${q}%` };
    if (active) where.category_id = active.id;
    const products = await Product.findAll({ where, include: [Category, StockLevel], order: [["name", "ASC"]] });

    res.render("home", {
      title: "Shop",
      q,
      categoryCode: active ? categoryCode : "",
      categories: categories.map((c) => ({ code: c.category_code, name: c.name, active: c.category_code === categoryCode })),
      products: products.map(toCard),
      filtered: Boolean(q || active),
      activeName: active?.name
    });
  } catch (err) {
    next(err);
  }
};

// GET /products/:code — product details
export const show = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { ...onlineWhere, product_code: req.params.code }, include: [Category, StockLevel] });
    if (!product) {
      return res.status(404).render("error", { title: "Product not found", heading: "Product not found",
        message: "This product is not sold online right now." });
    }
    const related = await Product.findAll({
      where: { ...onlineWhere, category_id: product.category_id, id: { [Op.ne]: product.id } },
      include: [Category, StockLevel], limit: 4, order: [["name", "ASC"]]
    });
    const card = toCard(product);
    res.render("product", { title: card.name, product: card, related: related.map(toCard) });
  } catch (err) {
    next(err);
  }
};
