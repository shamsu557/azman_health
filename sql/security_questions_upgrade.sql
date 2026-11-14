
-- Security questions for student, staff and professional accounts.
-- Answers are normalized (trimmed and uppercase) before bcrypt hashing.
CREATE TABLE IF NOT EXISTS user_security_questions (
 user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 question VARCHAR(240) NOT NULL,
 answer_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
