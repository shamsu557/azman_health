-- Run once in phpMyAdmin for existing installations.
ALTER TABLE users ADD COLUMN gender ENUM('female','male','other','prefer_not_to_say') NULL;
ALTER TABLE users ADD COLUMN professional_rank VARCHAR(100) NULL;
-- If either column already exists, skip its ALTER TABLE statement.
