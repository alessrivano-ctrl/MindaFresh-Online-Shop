-- 002-attendance-lunch.sql  (Attendance, Brian — accepted in blueprint v2.4)
-- Adds lunch out / lunch in times to attendance_logs. Existing rows keep working (both columns are NULL-able).
-- Run ONCE on a database imported from an older schema.sql. A fresh import of the v2.4 schema.sql already has these columns.
-- If the DB host already ran it, do not run it again (it will say "Duplicate column name").
USE mindafresh_db;

ALTER TABLE attendance_logs
  ADD COLUMN lunch_out DATETIME NULL AFTER time_in,
  ADD COLUMN lunch_in  DATETIME NULL AFTER lunch_out,
  ADD CONSTRAINT chk_attendance_lunch CHECK (
        (lunch_in  IS NULL OR lunch_out IS NOT NULL)
    AND (lunch_out IS NULL OR time_in  IS NULL OR lunch_out >= time_in)
    AND (lunch_in  IS NULL OR lunch_in >= lunch_out)
    AND (lunch_in  IS NULL OR time_out IS NULL OR time_out >= lunch_in)
  );
