// reviewController — use cases "Write review" (Customer) and "Moderate reviews" (Admin)
import * as reviewService from "../services/reviewService.js";
import { AppError } from "../utils/appError.js";

const handle = (err, req, next) => {
  if (!(err instanceof AppError)) return next(err);
  req.flash("error_msg", err.message);
  return null;
};

// POST /orders/:code/reviews — rate a product from a delivered order (customer); body: product_code, rating, comment
export const save = async (req, res, next) => {
  const productCode = String(req.body.product_code || "");
  const back = `/orders/${encodeURIComponent(req.params.code)}#rate-${encodeURIComponent(productCode)}`;
  try {
    const { product, created, hidden } = await reviewService.saveReview(req.session.customer.id, req.params.code, productCode, req.body);
    req.flash("success_msg", hidden ? `Your review of ${product.name} was updated. It is hidden by the store, so other customers cannot see it.`
      : created ? `Thanks! Your review of ${product.name} is posted.` : `Your review of ${product.name} was updated.`);
    res.redirect(back);
  } catch (err) {
    if (handle(err, req, next) === null) res.redirect(back);
  }
};

// GET /admin/reviews?status= — all reviews (admin)
export const list = async (req, res, next) => {
  try {
    const data = await reviewService.listForAdmin({ status: req.query.status });
    res.render("admin-reviews", { title: "Reviews", nav: "reviews", ...data });
  } catch (err) {
    next(err);
  }
};

// POST /admin/reviews/:id/status — hide or show a review (admin)
export const setStatus = async (req, res, next) => {
  const back = `/admin/reviews${req.query.status ? `?status=${encodeURIComponent(req.query.status)}` : ""}`;
  try {
    const review = await reviewService.setStatus(req.params.id, req.body.status);
    req.flash("success_msg", review.status === "hidden"
      ? `The review of ${review.Product?.name} is now hidden from the shop.`
      : `The review of ${review.Product?.name} is visible again.`);
    res.redirect(back);
  } catch (err) {
    if (handle(err, req, next) === null) res.redirect(back);
  }
};
