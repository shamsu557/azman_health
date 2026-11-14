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

## Security question and password update
- Run `sql/security_questions_upgrade.sql` in your selected MySQL database if upgrading an existing installation; for fresh installs the table is included in `sql/schema.sql`.
- `node hash.js` displays a numbered list of questions for administrator selection.
- Student/staff registration and professional account creation require a selected question and answer.
- Answers are `.trim().toUpperCase()` normalized before being bcrypt-hashed in MySQL. They are **not** stored as plaintext; enter the same answer when recovering.
- Passwords now accept **any combination of at least six characters**, including all letters or all digits. This is user-requested but less secure than a longer password; use a longer, unique password for administrator and clinical accounts.
- Administrator recovery at `/admin/password` still requires the offline recovery code in addition to the security answer.
- Existing users are not retroactively assigned security questions; administrators must provision their recovery settings separately.

## November update: WhatsApp, admin SPN, and responsive design
- `node hash.js` now prompts for the administrator's unique SPN and WhatsApp/phone number; both are stored in `users.identifier` and `users.phone` with `role='admin'`.
- The administrator is eligible to manage their own dependants, while retaining admin access. This is a single user account, not a second staff account.
- The registered `users.phone` is the WhatsApp contact source for staff, doctors, students and support personnel. Nigerian local 11-digit numbers beginning `0` are converted to `234...` for `wa.me` links; international numbers can be entered with a country code.
- `/api/whatsapp/contact/:id` opens WhatsApp only for authorized contacts; the admin/support WhatsApp directory has direct click-to-chat actions. Clinical consultation WhatsApp links prefer the doctor's registered signup number.
- The emergency clinical console has click-to-chat buttons for doctors in the emergency request list. Clicking opens WhatsApp; **messages are not automatically sent**, and the app cannot automatically start WhatsApp voice/video calls.
- The new logo is an **original Azman HealthConnect concept**, not a verified reproduction of Azman University's official institutional seal. Replace or approve it through the university branding team before public deployment.
- UI layout is responsive and uses the existing locally served stylesheet; no Tailwind CDN is required. Tailwind source CSS is retained.
- Database structure is unchanged for this update because the existing `users.identifier` and `users.phone` columns are reused. For fresh installations use `sql/schema.sql`; for existing installations use only previously missing migrations.
- **Production caveat:** This code has not been audited or integration-tested against your hosted MySQL instance. It is not ready for clinical deployment.


## Admin levels, dependant approvals and responsive sidebar
For existing installations run `sql/admin_levels_dependants_upgrade.sql` in phpMyAdmin, then use the printed administrator ID to promote the existing primary administrator to `super` as described in the SQL comments. Re-login after the upgrade. New admin creation via `hash.js` sets `super` automatically. Assistant administrators cannot deactivate or demote super administrators; user deactivation is a soft suspension preserving clinical records. The new `Dependant approvals` menu shows all staff dependants, including the administrator’s own spouse. One, two, or three dependants can be submitted together. Profile photo upload is available for dependants and through admin user management. Prescription and laboratory workflows are retained from the previous package.

## Gender, professional rank, status and reception dashboard update
For existing databases, execute `sql/gender_rank_upgrade.sql` once using phpMyAdmin. Do not run the ALTER statements for columns already present. New installations include these columns in `sql/schema.sql`.

- Registration uses a gender dropdown and optional staff rank dropdown.
- Administrator account creation and professional worker creation use gender and role-specific rank dropdowns. Receptionist is a supported worker role.
- User approvals have a status dropdown and explicit Save button; administrator protection remains enforced on the server.
- Receptionists have a dedicated front-desk dashboard showing today's appointment queue, confirmation, and check-in. Receptionists are restricted to confirmation, check-in, and no-show appointment status changes. These are not medical-record editing privileges.
- The dashboard uses existing appointments data. Dates are displayed in the application's configured timezone; the browser's local date is used for today's queue.

**Important:** Existing installations must apply all prior migration scripts as applicable before this update. Integration testing against your MySQL installation is still required.

## Fresh installation / new dependant workflow
Import **only** `sql/AZMAN_COMPLETE_FRESH_INSTALL.sql` into a new empty MySQL 8 database; do not run the old upgrade scripts. Configure `.env` for the new database, then run `node hash.js` to create the super administrator.
Dependants are active immediately on creation. Staff cannot directly edit/delete their dependant records; they submit a reasoned request and an admin or support reviewer approves/rejects it. Approved deletion deactivates the dependant (no destructive removal). The desktop sidebar fills the dashboard height and mobile displays a Menu toggle.


## November 2026 navigation, profile and recovery update
- The login page links to `/forgot-password` for non-admin accounts and shows the full university product name.
- Admin recovery remains `/admin/password` and requires the offline recovery code.
- The new non-admin security-question reset is rate-limited but **is not secure enough for production use without independent ownership verification** (for example a verified email reset token). Enable such verification before processing real patient information.
- Existing accounts without a `user_security_questions` record must have an administrator provision a recovery method; the UI cannot infer their answers.
- User management and approval screens now show uploaded profile images. Authorized clinical staff may view image IDs, but sensitive images should be further scoped to assigned patients in production.
- Profile image uploads are linked to the `users.profile_image_id` field; existing orphan images are not automatically linked.
- Clinical operations now includes a back-to-dashboard link. Dependant change requests display readable field/value pairs rather than raw JSON.
- No SQL schema migration is required if you already imported `sql/AZMAN_COMPLETE_FRESH_INSTALL.sql`.

## Login/footer and recovery styling correction
The public Clinical Operations link has been removed from the login page. Admin/support see a Clinical operations button in the dashboard sidebar. Administrator recovery is styled and retains its offline-code requirement. No database changes required. Note: the client-side role gate is a presentation measure; all sensitive clinical API endpoints must also enforce server-side role authorization.


## Staff-controlled account provisioning and first login
- Public self-registration is disabled. Only administrators and IT support can create accounts.
- Student accounts receive the temporary password `stud123`; staff and healthcare-worker accounts receive `staff123`.
- All provisioned accounts are active and flagged for first-login setup. The user must set a new password (minimum 6 characters), select a security question and enter an answer before using the portal.
- Staff includes university employees. Clinical staff retain role-specific accounts (doctor, consultant, nurse, laboratory, pharmacy, reception, records, support and IT) for permissions.
- `sql/staff_onboarding_dependants_booking_upgrade.sql` adds `must_change_password` and dependant numbers for an existing database. Updated `sql/schema.sql` includes them for fresh installs.

## Dependants
- Staff can add one to three dependants in a single submission, edit their own dependant details and deactivate dependants without an approval workflow.
- Dependant numbers use the staff SPN: spouse `/01`, first child `/02`, second child `/03`.
- Deactivation is soft-delete; historic medical records remain retained.

## Doctor appointment availability
- Booking uses 30-minute slots generated from published clinician availability windows.
- The booking page shows available slots for a selected clinician, or all available clinicians when “Any available doctor” is selected.
- A selected clinician/time is revalidated server-side at submission to prevent booking outside their published availability or double-booking.


## Staff-controlled provisioning and first login
- Public self-registration is disabled. Administrators and IT support create all accounts.
- Student temporary password: `stud123`. Staff and all healthcare-worker roles: `staff123`.
- First sign-in requires a new password (6+ characters), selected security question and answer.
- Dependants can be added, edited and deactivated by the staff account holder without approval. Spouse ID is SPN/01; children are SPN/02 and SPN/03.
- Booking shows 30-minute slots generated from published doctor availability. A selected slot is revalidated at booking time to prevent double-booking.
- Existing database: run `sql/staff_onboarding_dependants_booking_upgrade.sql`. Fresh database: use the updated `sql/schema.sql`.


## Important operational notes
- Student accounts are provisioned with `stud123`; every staff/healthcare role is provisioned with `staff123`. Users must change the temporary password and set a security question/answer on first sign-in.
- Admin and IT Support are the only account-creation routes; the public registration form/API is disabled.
- Employee roles (university staff, doctors, consultants, nurses, lab, pharmacy, reception, records, support, IT and administrators) can manage their own dependants.
- Dependant deletion is a soft deactivation so historical appointments and clinical records are preserved.


## November 14, 2026: WhatsApp role permissions and role dashboards
- WhatsApp contact permissions are role-scoped: admin/support/IT can open registered user and dependant numbers in their portal; reception can contact users/dependants with active appointment records; doctors/consultants can contact only patients/dependants with an assigned appointment, including requests awaiting confirmation; patients can contact their assigned clinician. Links use `wa.me` and require the user's WhatsApp app/account.
- Added an appointment-scoped WhatsApp endpoint so doctors see a Chat Patient action for their own requested/confirmed appointments and patients see Chat Doctor for their own appointments.
- Reception dashboard includes today's queue, confirmation, check-in, no-show, patient directory/search, booking for existing patients/dependants, WhatsApp contact and doctor availability. Reception API responses omit the consultation reason; reception is blocked from clinical notes/records endpoints.
- IT Support dashboard includes account provisioning, permitted profile editing, account status, temporary password reset, WhatsApp directory and technical account audit events. IT Support cannot manage administrator accounts.
- HealthConnect runs as a standard responsive website; the website logo, normal browser favicon, mobile layout, authentication and all healthcare modules remain enabled.

## In-app messaging and notifications update

This update adds role-scoped direct messaging and a private notification centre.

- Students and staff can initiate in-app messages to doctors and consultants.
- Doctors and consultants can reply only to patients with an active/requested appointment assigned to them.
- IT Support, Support and administrators can message any approved portal user.
- Messages are available from the Messages item in every user dashboard.
- A user can clear one conversation or clear all conversations from their own view. Clearing does not delete the other participant's copy.
- Notifications are private to each account, can be marked read individually or all at once, and can be cleared from the user's view.
- Appointment submissions, appointment status changes, new messages and emergency recalls create in-app notifications.

### Database migration for existing installations

Run `sql/messaging_notifications_upgrade.sql` once against the existing Azman database. Fresh installations already include these tables in `sql/schema.sql`. No existing user, appointment, clinical, or message data is dropped.


## Clinical workflow, availability and session-security update
- Admin/support can publish doctor/consultant availability windows, edit them and delete them when no active appointments depend on the window. Doctors/consultants can manage their own windows. Reception can view availability.
- Booking continues to derive 30-minute appointment slots from the published availability windows; occupied times are excluded and the server rechecks availability and double-booking during booking.
- Reception WhatsApp directory now lists all approved portal accounts and active dependants with registered phone numbers. This opens a WhatsApp chat; it does not send automated messages.
- Authenticated sessions expire after five minutes without activity. The server enforces the idle timeout and the browser signs the user out after five minutes without interaction.
- Doctors/consultants can view patient history only for patients with appointments assigned to them.
- Patients can view their prescriptions and laboratory requests, download prescription and laboratory request PDFs, and upload a test-result PDF/JPG/PNG (maximum 10 MB) for the healthcare team.
- Uploaded laboratory files are stored in MySQL in the `lab_result_documents` table, not in a public upload folder. Access is restricted to the patient, assigned clinician, laboratory role and administrators.
- Fresh database: use `sql/AZMAN_COMPLETE_FRESH_INSTALL.sql` (or `sql/schema.sql`). Existing database: run `sql/availability_sessions_lab_documents_upgrade.sql` once in phpMyAdmin. No existing user or clinical records are deleted.
- The generated prescription/test-request PDFs are printable administrative documents; clinical staff must verify all details, and prescriptions must be issued only by appropriately authorized prescribers.


## Account and dependant self-service refinements
- Doctor availability is not fixed to 10:00 a.m.–4:00 p.m. That was an example only. Authorized staff enter any valid start/end date-time for each schedule; booking slots are generated within those windows.
- All approved portal account types, including students, can manage their own dependants from My dependants: add, edit, upload a dependant photo, or remove. Changes apply directly to the account holder's own dependants; no administrator approval workflow is used.
- The dependant-change-request screen has been removed from administrator and support navigation and dashboards. Legacy request endpoints/tables are retained for compatibility but are not used by the user interface.
- User Management now presents Edit user, Save status and Delete user actions. The reset-password shortcut is removed from the main management screens.
- Delete user is implemented as account deactivation (status=suspended), not a hard database deletion, to preserve appointments, prescriptions, clinical records and audit trails. Super-administrator accounts are protected; IT Support cannot modify administrator accounts.


## Clinical operations console correction
- Doctor/consultant selection is now populated from the authenticated `/api/clinicians` database endpoint. The user selects a name; the app submits the corresponding internal ID.
- Shift creation uses explicit start date, start time, end date and end time fields.
- Emergency requests and backup escalation use database-backed clinician dropdowns rather than manually typed IDs.
- Shift listing displays clinician names and offers edit/delete controls to administrators and support.
- Clinical console API requests use the existing `/api` route paths and display clearer connection/HTTP errors.


## Booking availability and clinical categorisation update
- Doctor shifts are now included in the availability calendar and booking-slot calculation. A shift with scheduled/checked-in status and physical/online/both coverage creates bookable 30-minute slots; cancelled/completed and on-call-only shifts do not.
- Availability and shifts are displayed together. Do not create a duplicate availability period for a period already covered by a shift; the API explains this instead of silently duplicating it.
- Booking slots include windows that have already started but still have future appointment time remaining, and look ahead up to 14 days by default.
- Booking can filter clinicians by selected department and specialty. GOPD is treated as a general pool and is not restricted to one specialty.
- Account creation uses department and specialty dropdowns. Clinical licence is optional; specialty can be left blank for non-clinical roles.
