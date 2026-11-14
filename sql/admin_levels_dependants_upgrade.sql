-- Run once in phpMyAdmin after selecting the Azman database.
ALTER TABLE users ADD COLUMN admin_level ENUM('super','assistant') NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN profile_image_id BIGINT UNSIGNED NULL;
-- Find your original administrator ID below, then manually assign super status.
SELECT id,name,email,identifier,admin_level FROM users WHERE role='admin';
-- Example (replace 1 with actual original administrator ID):
-- UPDATE users SET admin_level='super' WHERE id=1 AND role='admin';
