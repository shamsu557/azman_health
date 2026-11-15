-- AZMAN HEALTHCONNECT: unified recovery-token migration
-- Run once against the existing production database after taking a verified backup.
-- Preserves users and all clinical/application records. Existing accounts are NOT issued invented tokens.
CREATE TABLE IF NOT EXISTS recovery_tokens (
 user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 token_hash VARCHAR(255) NOT NULL,
 failed_attempts INT NOT NULL DEFAULT 0,
 locked_until DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 used_at DATETIME NULL,
 CONSTRAINT fk_recovery_tokens_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_recovery_locked(locked_until)
) ENGINE=InnoDB;

-- Remove legacy question-based recovery records only after confirming the new application
-- has been deployed and the backup is available.
DROP TABLE IF EXISTS user_security_questions;
DROP TABLE IF EXISTS admin_recovery;

-- Existing accounts intentionally have no recovery_tokens row. They must authenticate
-- with their existing password and enroll through POST /api/auth/recovery/enroll,
-- or complete a support-issued temporary password reset and first-login flow.
