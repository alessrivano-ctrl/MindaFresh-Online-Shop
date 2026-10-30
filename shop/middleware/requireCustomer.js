// Shop only: pages that need a logged-in customer (cart, checkout, my orders).
export const requireCustomer = (req, res, next) => {
  if (req.session.customer) return next();
  req.session.returnTo = req.method === "GET" ? req.originalUrl : (req.get("Referer") || "/");
  req.flash("error_msg", "Please log in first.");
  res.redirect("/login");
};
