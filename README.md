# Azman University HealthConnect

Azman University HealthConnect is an integrated university healthcare portal. See the application source and SQL files for deployment details.

## Installation and deployment
1. Configure the MySQL database and environment variables using `.env.example`.
2. For a new empty database, import `sql/schema.sql` (or the complete fresh-install SQL file if that is your deployment workflow).
3. For an existing installation, back up the database and run `sql/unified_recovery_token_upgrade.sql` once.
4. Install dependencies with `npm install` and start with `npm start`.
5. Create the initial administrator using `npm run admin:create`. The administrator must change the initial password at first login and save the recovery token displayed afterwards.

## Unified recovery-token system
Security questions and answers are removed from the active application. All account categories use the same recovery-token flow. At first login, users must replace their temporary password. Only after the password update succeeds does the system generate a 32-byte cryptographically random recovery token. The token is displayed once and the database stores only its bcrypt hash.

Forgot-password recovery requires the registered email/SPN/registration identifier, the saved recovery token, and a new password with confirmation. Successful recovery changes the password and rotates the token in a database transaction. The old token becomes invalid. Recovery attempts are rate-limited and failed attempts are tracked.

Existing accounts are preserved and are not assigned invented tokens or forced password resets by the migration. After deploying the migration, existing users should sign in, open **My profile**, enter their current password under **Account recovery token**, and generate their first token. Alternatively, authorized IT support or an administrator can issue a temporary password reset; the user then completes first-login setup and receives a recovery token.

The migration creates `recovery_tokens` and removes the obsolete `user_security_questions` and `admin_recovery` tables. Back up the database before running it. Do not execute the retired legacy recovery upgrade scripts.

## Important operational notes
The five-minute server-side idle session timeout remains enabled. Existing role-based access control, clinical workflows, appointments, notifications, patient records and account-management routes are retained.
