-- 001-case-sensitive-status.sql  (proposed by Ali — needs group OK under the change rule)
-- Problem: the tables use utf8mb4_unicode_ci (case-INSENSITIVE), so the CHECK constraints accept
--          Completed, PENDING or Regular. The blueprint (Sections 3 and 10) says they must be rejected.
-- Fix:     the 30 columns that have a fixed value list compare with utf8mb4_bin (case-sensitive).
--          Nothing else changes: same types, NULL rules, defaults and CHECK constraints. Data is kept.
-- Run once on the DB host (and on solo-mode laptops): phpMyAdmin → mindafresh_db → Import this file.
-- Then also put COLLATE utf8mb4_bin on these columns in schema.sql, so a fresh import is the same.
USE mindafresh_db;

ALTER TABLE accounts
  MODIFY account_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY normal_balance VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE attendance_logs
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE customers
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'active';

ALTER TABLE employees
  MODIFY employment_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'active';

ALTER TABLE holidays
  MODIFY holiday_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE journal_entries
  MODIFY source_module VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY entry_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'posted';

ALTER TABLE leave_requests
  MODIFY leave_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  MODIFY payment_method VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY payment_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'unpaid',
  MODIFY order_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending';

ALTER TABLE payroll_runs
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'draft';

ALTER TABLE products
  MODIFY unit VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'active';

ALTER TABLE purchase_orders
  MODIFY payment_method VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'draft';

ALTER TABLE remittances
  MODIFY agency VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending';

ALTER TABLE salary_releases
  MODIFY release_method VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending';

ALTER TABLE sales
  MODIFY payment_method VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'completed';

ALTER TABLE stock_movements
  MODIFY movement_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE suppliers
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'active';

ALTER TABLE users
  MODIFY role VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  MODIFY status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'active';
