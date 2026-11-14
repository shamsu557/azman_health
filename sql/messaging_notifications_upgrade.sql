-- Run once against an existing Azman HealthConnect database.
CREATE TABLE IF NOT EXISTS direct_conversations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_one_id BIGINT UNSIGNED NOT NULL,
 user_two_id BIGINT UNSIGNED NOT NULL,
 user_one_cleared_at DATETIME NULL,
 user_two_cleared_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_direct_pair(user_one_id,user_two_id),
 CONSTRAINT fk_dc_user_one FOREIGN KEY(user_one_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_dc_user_two FOREIGN KEY(user_two_id) REFERENCES users(id) ON DELETE CASCADE,
 CHECK(user_one_id < user_two_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS direct_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 conversation_id BIGINT UNSIGNED NOT NULL,
 sender_id BIGINT UNSIGNED NOT NULL,
 body TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_dm_conversation(conversation_id,id),
 CONSTRAINT fk_dm_conversation FOREIGN KEY(conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
 CONSTRAINT fk_dm_sender FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS app_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(180) NOT NULL,
 body VARCHAR(1000) NOT NULL,
 category VARCHAR(60) NOT NULL DEFAULT 'information',
 target_url VARCHAR(300) NULL,
 read_at DATETIME NULL,
 hidden_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_app_notice_user(user_id,hidden_at,created_at),
 CONSTRAINT fk_app_notice_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
