-- 003-product-reviews.sql  (proposed by Ali, Online Shop — needs group OK under the change rule)
-- Adds the Shop-owned table product_reviews: one review (1–5 stars + comment) per customer per product,
-- allowed only after the customer received the product (order delivered or returned).
-- No other module's table changes. Run once on the DB host (and solo-mode laptops):
-- phpMyAdmin → mindafresh_db → Import this file.
USE mindafresh_db;

-- Online Shop (Ali): product_reviews
CREATE TABLE product_reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'visible',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_review_customer_product (customer_id, product_id),
  CONSTRAINT fk_product_reviews_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_product_reviews_product_id FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_product_reviews_order_id FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_product_reviews_status CHECK (status IN ('visible', 'hidden'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
