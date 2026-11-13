-- AZMAN HEALTHCONNECT: ONE-FILE FRESH INSTALLATION
-- Import into a NEW, EMPTY MySQL 8 database in phpMyAdmin.
-- Does not create or drop a database. Do not run against an existing installation.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, identifier VARCHAR(80) UNIQUE, email VARCHAR(190) NOT NULL UNIQUE, phone VARCHAR(30), password_hash VARCHAR(255) NOT NULL,
 role ENUM('student','staff','dependant','admin','support','reception','records','nurse','doctor','consultant','lab','pharmacy','it') NOT NULL,
 status ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending', must_change_password TINYINT(1) NOT NULL DEFAULT 0, admin_level ENUM('super','assistant') NULL DEFAULT NULL, profile_image_id BIGINT UNSIGNED NULL, department VARCHAR(120), gender ENUM('female','male','other','prefer_not_to_say') NULL, professional_rank VARCHAR(100) NULL, registration_details JSON,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX(role,status)
);
CREATE TABLE IF NOT EXISTS dependants (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, staff_id BIGINT UNSIGNED NOT NULL, dependant_number VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL, relationship VARCHAR(30) NOT NULL, birth_date DATE, gender VARCHAR(30), phone VARCHAR(30),
 status ENUM('pending','approved','inactive','rejected') NOT NULL DEFAULT 'approved', image_id BIGINT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(staff_id) REFERENCES users(id), INDEX(staff_id,status)
);
CREATE TABLE IF NOT EXISTS images (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, owner_user_id BIGINT UNSIGNED NOT NULL, mime VARCHAR(40) NOT NULL, bytes MEDIUMBLOB NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS departments (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, active BOOLEAN DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS clinician_profiles (user_id BIGINT UNSIGNED PRIMARY KEY, license_number VARCHAR(100), license_verified BOOLEAN DEFAULT FALSE, specialty VARCHAR(120), can_prescribe BOOLEAN DEFAULT FALSE, whatsapp_number VARCHAR(30) NULL, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS availability (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, clinician_id BIGINT UNSIGNED NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, active BOOLEAN DEFAULT TRUE, UNIQUE KEY uq_clinician_start(clinician_id,starts_at), FOREIGN KEY(clinician_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS appointments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, patient_id BIGINT UNSIGNED NOT NULL, dependant_id BIGINT UNSIGNED NULL, clinician_id BIGINT UNSIGNED NULL, department_id INT NOT NULL,
 mode ENUM('physical','online') NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, reason VARCHAR(500), status ENUM('requested','confirmed','checked_in','triage','in_consultation','completed','cancelled','no_show') DEFAULT 'requested',
 meeting_url VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(patient_id) REFERENCES users(id), FOREIGN KEY(dependant_id) REFERENCES dependants(id), FOREIGN KEY(clinician_id) REFERENCES users(id), FOREIGN KEY(department_id) REFERENCES departments(id), INDEX(starts_at,status), INDEX(clinician_id,starts_at)
);
CREATE TABLE IF NOT EXISTS encounters (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, appointment_id BIGINT UNSIGNED NOT NULL UNIQUE, clinician_id BIGINT UNSIGNED NOT NULL, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, signed_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(appointment_id) REFERENCES appointments(id), FOREIGN KEY(clinician_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS vitals (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, appointment_id BIGINT UNSIGNED NOT NULL, nurse_id BIGINT UNSIGNED NOT NULL, temperature DECIMAL(4,1), systolic SMALLINT, diastolic SMALLINT, pulse SMALLINT, oxygen SMALLINT, weight DECIMAL(6,2), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(appointment_id) REFERENCES appointments(id), FOREIGN KEY(nurse_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS lab_orders (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, appointment_id BIGINT UNSIGNED NOT NULL, requested_by BIGINT UNSIGNED NOT NULL, test_name VARCHAR(160) NOT NULL, status ENUM('ordered','collected','processing','released') DEFAULT 'ordered', result_text TEXT, reviewed_by BIGINT UNSIGNED NULL, released_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(appointment_id) REFERENCES appointments(id));
CREATE TABLE IF NOT EXISTS prescriptions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, appointment_id BIGINT UNSIGNED NOT NULL, clinician_id BIGINT UNSIGNED NOT NULL, medication VARCHAR(160) NOT NULL, dose VARCHAR(100) NOT NULL, route VARCHAR(50), frequency VARCHAR(100), duration VARCHAR(100), instructions TEXT, status ENUM('ordered','dispensed','cancelled') DEFAULT 'ordered', dispensed_by BIGINT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(appointment_id) REFERENCES appointments(id));
CREATE TABLE IF NOT EXISTS inventory (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, medication VARCHAR(160) NOT NULL, batch VARCHAR(100), quantity INT NOT NULL DEFAULT 0, expiry_date DATE, UNIQUE KEY uq_med_batch(medication,batch));
CREATE TABLE IF NOT EXISTS notifications (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NULL, channel ENUM('in_app','whatsapp','email') NOT NULL, message TEXT NOT NULL, status ENUM('queued','sent','failed') DEFAULT 'queued', attempts INT DEFAULT 0, last_error VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT UNSIGNED NULL, action VARCHAR(100) NOT NULL, target_type VARCHAR(80), target_id VARCHAR(80), details JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(actor_id,created_at));
INSERT IGNORE INTO departments(name) VALUES ('GOPD'),('Paediatrics'),('Diabetes / Endocrinology'),('Gynaecology'),('Internal Medicine'),('Family Medicine'),('Dermatology'),('Mental Health'),('Dental'),('Laboratory');

-- Administrator recovery: execute this complete SQL script in MySQL Workbench/phpMyAdmin.
CREATE TABLE IF NOT EXISTS admin_recovery (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 question VARCHAR(240) NOT NULL,
 answer_hash VARCHAR(255) NOT NULL,
 recovery_code_hash VARCHAR(255) NOT NULL,
 failed_attempts INT NOT NULL DEFAULT 0,
 locked_until DATETIME NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_admin_recovery_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- 24-hour roster, flexible consultation methods, internal chat and emergency recall
CREATE TABLE IF NOT EXISTS sessions (session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, expires INT UNSIGNED NOT NULL, data MEDIUMTEXT COLLATE utf8mb4_bin, INDEX idx_sessions_expires(expires)) ENGINE=InnoDB;
-- Clinician WhatsApp number is included directly in clinician_profiles.
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


-- Security questions for student, staff and professional accounts.
-- Answers are normalized (trimmed and uppercase) before bcrypt hashing.
CREATE TABLE IF NOT EXISTS user_security_questions (
 user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 question VARCHAR(240) NOT NULL,
 answer_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- Dependant modifications are requested by staff and reviewed by admin/support.
CREATE TABLE IF NOT EXISTS dependant_change_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 dependant_id BIGINT UNSIGNED NOT NULL,
 requested_by BIGINT UNSIGNED NOT NULL,
 action ENUM('edit','delete') NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 proposed_changes JSON NULL,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 reviewed_by BIGINT UNSIGNED NULL,
 review_note VARCHAR(1000) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at DATETIME NULL,
 FOREIGN KEY (dependant_id) REFERENCES dependants(id),
 FOREIGN KEY (requested_by) REFERENCES users(id),
 FOREIGN KEY (reviewed_by) REFERENCES users(id),
 INDEX(status,created_at), INDEX(requested_by,created_at)
) ENGINE=InnoDB;

-- Confirm all application tables.
SHOW TABLES;
