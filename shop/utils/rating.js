// shop/utils/rating.js — star ratings for product reviews (Shop only, not shared)
export const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

// ★★★★☆ for 4 (or 4.3); half stars are rounded to the nearest whole star
export const starText = (rating) => {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(full) + "☆".repeat(5 - full);
};
