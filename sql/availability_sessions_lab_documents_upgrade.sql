-- Azman HealthConnect: doctor availability, 5-minute inactivity sessions and lab-result uploads
-- Run once in phpMyAdmin after selecting the existing Azman database.
-- No existing clinical or user data is deleted.

CREATE TABLE IF NOT EXISTS lab_result_documents (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 lab_order_id BIGINT UNSIGNED NOT NULL,
 uploaded_by BIGINT UNSIGNED NOT NULL,
 file_name VARCHAR(180) NOT NULL,
 mime_type VARCHAR(80) NOT NULL,
 file_data LONGBLOB NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE,
 FOREIGN KEY(uploaded_by) REFERENCES users(id),
 INDEX(lab_order_id,created_at)
) ENGINE=InnoDB;

-- Availability records already use the availability table. The application now supports
-- administrative create/edit/delete, clinician self-management, and overlap protection.
-- Session timeout is application configuration; no database alteration is required.
