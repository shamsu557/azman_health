-- Existing installation: run in your MySQL GUI after selecting your Azman database.
-- The following changes are also included at the end of schema.sql for fresh installs.
-- 24-hour roster, flexible consultation methods, internal chat and emergency recall
CREATE TABLE IF NOT EXISTS sessions (session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, expires INT UNSIGNED NOT NULL, data MEDIUMTEXT COLLATE utf8mb4_bin, INDEX idx_sessions_expires(expires)) ENGINE=InnoDB;
-- Add WhatsApp number only when missing (MySQL 8 / MariaDB compatible).
SET @has_whatsapp = (SELECT COUNT(*) FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clinician_profiles' AND COLUMN_NAME='whatsapp_number');
SET @statement = IF(@has_whatsapp=0,
 'ALTER TABLE clinician_profiles ADD COLUMN whatsapp_number VARCHAR(30) NULL',
 'SELECT ''WhatsApp column already exists'' AS result');
PREPARE azman_alter FROM @statement;
EXECUTE azman_alter;
DEALLOCATE PREPARE azman_alter;
CREATE TABLE IF NOT EXISTS doctor_shifts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, clinician_id BIGINT UNSIGNED NOT NULL,
 starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL,
 coverage ENUM('physical','online','both','on_call') NOT NULL,
 status ENUM('scheduled','checked_in','completed','cancelled') NOT NULL DEFAULT 'scheduled',
 created_by BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(clinician_id) REFERENCES users(id), FOREIGN KEY(created_by) REFERENCES users(id), INDEX(starts_at,ends_at,coverage)
);
CREATE TABLE IF NOT EXISTS consultation_sessions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
 current_method ENUM('internal_text','whatsapp_text','whatsapp_audio','whatsapp_video','physical') NOT NULL DEFAULT 'internal_text',
 status ENUM('waiting','active','completed') NOT NULL DEFAULT 'waiting', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(appointment_id) REFERENCES appointments(id)
);
CREATE TABLE IF NOT EXISTS consultation_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, consultation_id BIGINT UNSIGNED NOT NULL, sender_id BIGINT UNSIGNED NOT NULL,
 body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(consultation_id) REFERENCES consultation_sessions(id), FOREIGN KEY(sender_id) REFERENCES users(id), INDEX(consultation_id,id)
);
CREATE TABLE IF NOT EXISTS consultation_method_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, consultation_id BIGINT UNSIGNED NOT NULL, requested_by BIGINT UNSIGNED NOT NULL,
 method ENUM('internal_text','whatsapp_text','whatsapp_audio','whatsapp_video','physical') NOT NULL,
 status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 responded_at DATETIME NULL, FOREIGN KEY(consultation_id) REFERENCES consultation_sessions(id), FOREIGN KEY(requested_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS emergency_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, requested_by BIGINT UNSIGNED NOT NULL, clinician_id BIGINT UNSIGNED NOT NULL,
 priority ENUM('critical','urgent','routine') NOT NULL, case_summary VARCHAR(800) NOT NULL,
 location VARCHAR(200) NOT NULL, required_by DATETIME NOT NULL,
 status ENUM('pending','accepted','rejected','en_route','arrived','completed','escalated','cancelled') NOT NULL DEFAULT 'pending',
 response_reason VARCHAR(500) NULL, estimated_arrival DATETIME NULL, responded_at DATETIME NULL, arrived_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(requested_by) REFERENCES users(id), FOREIGN KEY(clinician_id) REFERENCES users(id), INDEX(status,created_at)
);
