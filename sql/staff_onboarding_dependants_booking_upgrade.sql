-- Existing database upgrade. Select your Azman database before running.
SET @db=DATABASE();
SET @has=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='must_change_password');
SET @q=IF(@has=0,'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0','SELECT 1'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @has=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dependants' AND COLUMN_NAME='dependant_number');
SET @q=IF(@has=0,'ALTER TABLE dependants ADD COLUMN dependant_number VARCHAR(100) NULL','SELECT 1'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE dependants d JOIN users u ON u.id=d.staff_id SET d.dependant_number=CONCAT(u.identifier,'/',LPAD((SELECT COUNT(*) FROM (SELECT id,staff_id FROM dependants) x WHERE x.staff_id=d.staff_id AND x.id<=d.id),2,'0')) WHERE d.dependant_number IS NULL;
SET @has=(SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dependants' AND INDEX_NAME='uq_dependant_number');
SET @q=IF(@has=0,'ALTER TABLE dependants ADD UNIQUE KEY uq_dependant_number (dependant_number)','SELECT 1'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
