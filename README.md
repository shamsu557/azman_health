# Azman HealthConnect — manual SQL and administrator recovery edition

This is a development prototype, NOT a production-ready hospital system.

## Database installation (NO database creation from Node.js)
1. Create an empty MySQL database, e.g. `azman_healthconnect`, using phpMyAdmin or MySQL Workbench.
2. Select that database.
3. Copy/paste and execute the entire `sql/schema.sql` script in its SQL editor.
4. If updating an earlier installation instead, execute `sql/admin_recovery_upgrade.sql` once.
5. Edit `.env` with database connection details, a strong SESSION_SECRET and production HTTPS settings.

## Create the first administrator
Run `npm install`, then `node hash.js`. Answer the prompts for name, email, password, security question and security answer. This inserts the administrator and bcrypt hashes directly into MySQL. Save the displayed **offline recovery code** securely; it is shown only once.

## Admin recovery
The administrator recovery page is at `/admin/password`. It is not linked from the login page. To reset a password, enter email, the security answer, the offline recovery code and a new password. The recovery code is rotated on success. The endpoint is rate-limited and temporarily locks after repeated failed attempts.

A security question alone is not considered sufficient authentication for a healthcare administrator. A second offline recovery factor is required. Recovery through the database administrator remains possible if both factors are lost, using a documented controlled procedure.

## Run
`npm start` after `npm install`.

## Notes
Profile images are compressed and stored in MySQL; the uploads folder remains empty until needed. Real telemedicine, WhatsApp sending, and full production clinical/security testing remain incomplete.


## Updated 24/7 operations and consultation modules
The full manual SQL script `sql/schema.sql` includes doctor_shifts, consultation_sessions, consultation_messages, consultation_method_requests, emergency_requests and the MySQL session table. No terminal-based database creation is required. For an existing database that already has the earlier schema, execute `sql/upgrade_from_admin_recovery.sql` in the SQL editor instead.

Open `/clinical-console.html` after signing in. Admin/support can assign shifts and create emergency doctor requests; doctors can accept with ETA or reject with reason. WhatsApp notifications are **queued in the database only** until an approved messaging gateway and delivery worker are configured. Never treat queued as sent. WhatsApp call buttons open a chat; calls are initiated manually in WhatsApp. In-system text chat uses authenticated API polling via Refresh; it is not a WebSocket live chat. Patients must accept a consultant's method-switch request. The original medical workflow endpoints remain available.

**Known limitations:** No verified live WhatsApp gateway, no automated emergency escalation or external emergency response dispatch, no real-time WebSocket chat, no patient-facing file attachments in consultation chat, no full automated integration testing against MySQL, and no independent clinical/security audit. Do not use with real patient data until these are addressed and the university approves the deployment.

## Updated operational modules
- Existing emergency request workflow, accept/reject, ETA, shift roster and internal chat are present.
- `POST /api/emergencies/:id/escalate` creates a backup recall request; supervisor action is required.
- `npm run notifications:send` processes queued WhatsApp notifications through the **official WhatsApp Cloud API**, provided valid credentials and an **approved template with two body parameters** are configured. This must be run by an authorized scheduler for ongoing delivery. It is NOT a live push service until credentials and a scheduler are configured.
- WhatsApp audio/video calls are initiated manually in WhatsApp. Calls and WhatsApp chat contents are not synchronized to patient records.
- For an existing database, execute `sql/upgrade_existing.sql` in your MySQL GUI; it now checks for an existing `whatsapp_number` column before altering. For new installations, execute `sql/schema.sql`.

## Critical limitations before patient use
This code has not undergone clinical safety validation, privacy/security penetration testing, live MySQL integration testing or operational acceptance testing. The WhatsApp provider and actual 24/7 staff coverage require external configuration and staffing. Do not deploy for real patient care without these checks.
