-- Run this manually for installations using an earlier database schema.
CREATE TABLE IF NOT EXISTS admin_recovery (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 question VARCHAR(240) NOT NULL,
 answer_hash VARCHAR(255) NOT NULL,
 recovery_code_hash VARCHAR(255) NOT NULL,
 failed_attempts INT NOT NULL DEFAULT 0,
 locked_until DATETIME NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
