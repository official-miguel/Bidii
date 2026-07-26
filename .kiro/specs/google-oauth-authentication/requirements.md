# Requirements Document

## Introduction

This feature replaces the email/password authentication system in the Bidii school management platform with Google OAuth 2.0. No passwords are collected, stored, or verified for new Google-authenticated users. The existing `Session` table, `bidii_session` cookie, and `getCurrentUser()` function remain unchanged — they are issued after Google identity verification rather than after bcrypt verification. The school picker (schoolSlug login field) is removed permanently because the `isActive = true` constraint guarantees that a given Gmail address is active at most one school at a time. Existing password-based accounts continue to work during a transition period to ensure backward compatibility.

Three flows are affected: (1) Principal-led school registration at `/signup`, (2) staff/principal login at `/login`, and (3) staff invitation and Google account linking when a new staff member activates their pre-created account. The Prisma `User` model gains a `googleSub` field (the Google `sub` claim) and `passwordHash` becomes nullable.

---

## Glossary

- **OAuth_Service**: The Bidii server-side component that initiates Google OAuth flows, exchanges authorization codes for tokens, verifies ID tokens, and issues `bidii_session` cookies.
- **Google_IDP**: Google's OAuth 2.0 / OpenID Connect identity provider (`accounts.google.com`).
- **User**: A row in the `User` table — one login credential scoped to one school.
- **Session**: A row in the `Session` table representing an active authenticated session, identified by a hashed token stored in the `bidii_session` HTTP-only cookie.
- **Principal**: A `User` with `role = PRINCIPAL` who registers a school and administers it.
- **Staff_Member**: A `User` with `role = TEACHER` or `role = ADMIN_STAFF` who is created by the Principal and must link a Google account via an invite link before first login.
- **Invite_Token**: A short-lived, single-use signed token embedded in a staff invitation URL that authorises the Google account–linking flow for exactly one pre-created `User` row.
- **googleSub**: The stable `sub` claim returned by Google's ID token — unique per Google account, persists even if the user changes their Gmail address.
- **Active_User**: A `User` row where `isActive = true`.
- **Inactive_User**: A `User` row where `isActive = false`, typically because the staff member has been deactivated by the Principal.
- **Change_Password_Flow**: The existing `/api/auth/change-password` route that forces newly created staff to reset their temporary password. This flow is retired for Google-authenticated users — `mustChangePassword` is always `false` for them.

---

## Requirements

### Requirement 1: Schema Changes

**User Story:** As a system, I need to store a Google identity claim alongside each user record so that a Gmail address can be matched to a Bidii account even after the user's display email changes.

#### Acceptance Criteria

1. THE OAuth_Service SHALL add a `googleSub` column of type `String?` (nullable) to the `User` table, with a unique constraint scoped globally (across all schools).
2. THE OAuth_Service SHALL make the `passwordHash` column on the `User` table nullable (`String?`), preserving all existing non-null values.
3. WHEN a `User` row is created via Google OAuth (signup or invite linking), THE OAuth_Service SHALL store the Google `sub` claim in `googleSub` and set `passwordHash` to `null`.
4. WHEN a `User` row was created before Google OAuth was introduced, THE OAuth_Service SHALL retain the existing non-null `passwordHash` and leave `googleSub` as `null` until the user completes Google linking.
5. THE OAuth_Service SHALL enforce that no two `User` rows share the same non-null `googleSub` value across all schools.

---

### Requirement 2: Environment Configuration

**User Story:** As a system administrator, I want the Google OAuth credentials to be managed via environment variables so that they can be rotated without code changes.

#### Acceptance Criteria

1. THE OAuth_Service SHALL read `GOOGLE_CLIENT_ID` from environment variables and reject startup if the variable is absent.
2. THE OAuth_Service SHALL read `GOOGLE_CLIENT_SECRET` from environment variables and reject startup if the variable is absent.
3. THE OAuth_Service SHALL read `GOOGLE_REDIRECT_URI` from environment variables and use it as the OAuth callback URL registered with Google Cloud Console.
4. IF `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI` is absent at request time, THEN THE OAuth_Service SHALL return HTTP 500 with a message indicating a server configuration error, without exposing variable names or values in the response body.

---

### Requirement 3: School Registration via Google OAuth (Signup)

**User Story:** As a new school administrator, I want to register my school and Principal account using my Google identity so that I do not need to create or remember a password.

#### Acceptance Criteria

1. WHEN a visitor submits the registration form with a school name, THE OAuth_Service SHALL initiate a Google OAuth authorization flow using the PKCE extension and redirect the browser to Google_IDP.
2. WHEN Google_IDP returns an authorization code to the callback URL, THE OAuth_Service SHALL exchange the code for an ID token and access token using `GOOGLE_CLIENT_SECRET`.
3. WHEN the ID token is received, THE OAuth_Service SHALL verify the token signature, audience (`aud` = `GOOGLE_CLIENT_ID`), issuer (`iss` ∈ `{accounts.google.com, https://accounts.google.com}`), and expiry before trusting any claims.
4. WHEN the ID token is valid, THE OAuth_Service SHALL extract the `sub` claim as `googleSub`, the `email` claim as the Principal's email, and optionally the `name` claim as the Principal's display name.
5. WHEN the extracted `googleSub` is already stored in an existing Active_User row, THEN THE OAuth_Service SHALL abort signup, destroy any partial state, and return an error message: "This Google account is already linked to a Bidii account. Sign in instead."
6. WHEN the extracted `googleSub` is not yet stored, THE OAuth_Service SHALL create the `School` row and the `Principal` `User` row in a single database transaction with `passwordHash = null`, `googleSub` set, and `mustChangePassword = false`.
7. WHEN the transaction in AC 3.6 succeeds, THE OAuth_Service SHALL create a `Session` row and set the `bidii_session` cookie with `httpOnly = true`, `sameSite = lax`, `maxAge = 604800` (7 days), and redirect the browser to `/principal`.
8. IF the Google OAuth flow is abandoned by the user (browser closed, back button pressed), THEN THE OAuth_Service SHALL discard any intermediate state (PKCE verifier, pending school form data) and return the user to `/signup` without creating any database rows.
9. IF Google_IDP returns an OAuth error response (e.g. `access_denied`), THEN THE OAuth_Service SHALL redirect to `/signup` with a human-readable error message explaining that Google sign-in was cancelled or failed.
10. IF the database transaction in AC 3.6 fails due to a slug collision, THEN THE OAuth_Service SHALL retry with a de-duplicated slug without requiring the user to re-authenticate with Google.
11. WHEN a Principal's registration form data (school name, optional address, optional phone) is captured before the OAuth redirect, THE OAuth_Service SHALL preserve that data across the OAuth round-trip using a server-side session or signed cookie so the user does not need to re-enter it after returning from Google_IDP.
12. THE signup form SHALL collect: school name (required), school address (optional), school phone (optional), and a "Continue with Google" button. THE signup form SHALL NOT collect password, confirm-password, or full-name fields.

---

### Requirement 4: Login via Google OAuth

**User Story:** As a staff member or Principal, I want to sign in with my Google account so that I do not need to remember a Bidii-specific password.

#### Acceptance Criteria

1. WHEN a user clicks "Sign in with Google" on the login page, THE OAuth_Service SHALL initiate a Google OAuth authorization flow with PKCE and redirect to Google_IDP.
2. WHEN Google_IDP returns an authorization code, THE OAuth_Service SHALL exchange it for an ID token and verify the token as specified in Requirement 3, AC 3.3.
3. WHEN the ID token is valid, THE OAuth_Service SHALL query for an Active_User matching the returned `googleSub` claim first; if no match is found by `googleSub`, THE OAuth_Service SHALL fall back to matching by `email` AND `isActive = true`.
4. WHEN exactly one Active_User is found by the lookup in AC 4.3, THE OAuth_Service SHALL create a `Session`, set the `bidii_session` cookie, and redirect to the appropriate dashboard based on `User.role`.
5. WHEN no Active_User is found for the returned Google identity, THEN THE OAuth_Service SHALL NOT create an account, SHALL NOT reveal whether the email has ever been registered, and SHALL display the message: "No active account found for this Google address. Contact your school administrator."
6. WHEN an Inactive_User exists for the returned `email` or `googleSub` but `isActive = false`, THEN THE OAuth_Service SHALL treat the lookup as "not found" and display the same message as AC 4.5 — no session is created.
7. THE login page SHALL contain a single "Sign in with Google" button and SHALL NOT contain email, password, school-identifier, or school-slug fields.
8. WHEN a Google account's email address changes (Google sends a new `email` claim but the same `sub` claim), THE OAuth_Service SHALL still successfully authenticate the user by matching on `googleSub`, and SHALL update the stored `email` field on the `User` row to reflect the new Gmail address.
9. IF Google_IDP returns an error during login, THEN THE OAuth_Service SHALL redirect to `/login` with the message: "Google sign-in failed. Please try again."
10. WHILE a valid `bidii_session` cookie exists, THE OAuth_Service SHALL serve authenticated requests without requiring re-authentication with Google_IDP.

---

### Requirement 5: Staff Invitation and Google Account Linking

**User Story:** As a Principal, I want to invite staff members by generating an invite link so that each staff member can link their own Google account to their pre-created Bidii record without the Principal handling passwords.

#### Acceptance Criteria

1. WHEN the Principal creates a staff member with login credentials enabled, THE OAuth_Service SHALL generate a signed, time-limited Invite_Token (valid for 72 hours) and return an invite URL of the form `/invite/[token]`.
2. THE OAuth_Service SHALL store a hash of the Invite_Token in a new `UserInvite` record linked to the `User.id`, along with the expiry timestamp and a `used` boolean flag.
3. WHEN a staff member opens the invite URL, THE OAuth_Service SHALL verify the Invite_Token is valid (signature correct, not expired, `used = false`) and display a "Link your Google account" page with a "Continue with Google" button.
4. WHEN the staff member clicks "Continue with Google" from the invite page, THE OAuth_Service SHALL initiate a Google OAuth flow with PKCE, embedding the Invite_Token reference in the OAuth state parameter.
5. WHEN Google_IDP returns the authorization code and the OAuth state parameter is validated, THE OAuth_Service SHALL verify the Invite_Token is still valid (not expired, `used = false`).
6. WHEN the Google ID token is verified and the Invite_Token is valid, THE OAuth_Service SHALL check whether the returned `googleSub` is already linked to any other Active_User row.
7. IF the returned `googleSub` is already linked to a different Active_User, THEN THE OAuth_Service SHALL reject the linking and display: "That Google account is already linked to another Bidii account. Use a different Google account."
8. IF the returned `email` from Google does not match the email on the pre-created `User` record, THEN THE OAuth_Service SHALL still proceed with linking (using the Google identity as authoritative), record the Google `email` and `googleSub` on the `User` row, and update `User.email` to the Google-returned email.
9. WHEN linking succeeds, THE OAuth_Service SHALL update the `User` row with `googleSub`, set `passwordHash = null`, set `mustChangePassword = false`, mark the Invite_Token as `used = true`, create a `Session`, set the `bidii_session` cookie, and redirect to the staff member's dashboard.
10. IF the Invite_Token has expired when the staff member opens the invite URL, THEN THE OAuth_Service SHALL display: "This invite link has expired. Ask your school administrator to resend the invitation."
11. IF the Invite_Token has already been used (`used = true`), THEN THE OAuth_Service SHALL display: "This invite link has already been used. Sign in with your Google account."
12. WHEN the Principal views a staff member's profile, THE OAuth_Service SHALL display whether the staff member has linked a Google account (`googleSub` is non-null) or is still pending invite completion.
13. THE Principal SHALL be able to resend an invite for a staff member whose existing invite has expired or has not yet been used, which SHALL invalidate the previous Invite_Token and generate a new one.
14. WHEN a staff member uses an invite link but navigates away from Google during the OAuth flow (abandonment), THE OAuth_Service SHALL preserve the Invite_Token as unused so the staff member can retry by reopening the original link.
15. WHEN the Principal sends an invite to a staff member whose email address differs from the Google account the staff member intends to use, THE OAuth_Service SHALL complete the linking using whichever Google account authenticates, updating `User.email` to match (per AC 5.8).

---

### Requirement 6: Deactivation and Account Freeing

**User Story:** As a Principal, I want deactivating a staff member to immediately free their Google account so that the same Gmail address can be reused at another school or re-linked at the same school.

#### Acceptance Criteria

1. WHEN a Principal sets `isActive = false` on a `User` row, THE OAuth_Service SHALL not change the `googleSub` field at the time of deactivation.
2. WHEN `isActive = false` is set, THE OAuth_Service SHALL delete all `Session` rows for that `User`, ensuring the deactivated staff member cannot continue using any active browser session.
3. WHEN a subsequent login attempt arrives with the deactivated user's `googleSub` or `email`, THE OAuth_Service SHALL treat the account as not found (per Requirement 4, AC 4.5–4.6) and show the "no active account" message.
4. WHEN the same Gmail address (same `googleSub`) is later used to register a brand-new school or to accept a new staff invite at a different school, THE OAuth_Service SHALL permit the operation because there is no Active_User with that `googleSub`.
5. THE OAuth_Service SHALL NOT clear `googleSub` from the deactivated `User` row, preserving the historical link for audit trail purposes.

---

### Requirement 7: Email Change Handling

**User Story:** As a user, I want to continue accessing Bidii even if I change my Gmail address so that a Gmail rename does not lock me out.

#### Acceptance Criteria

1. WHEN Google_IDP returns an ID token with a `sub` claim that matches an Active_User's `googleSub` but a different `email` than stored, THE OAuth_Service SHALL authenticate the user successfully.
2. WHEN authentication succeeds via `googleSub` match with a changed email, THE OAuth_Service SHALL update `User.email` to the new Google-returned email in the same transaction as session creation.
3. WHEN `User.email` is updated due to a Gmail address change, THE OAuth_Service SHALL write an audit log entry recording the old email, the new email, the timestamp, and that the change was triggered by Google OAuth.
4. AFTER `User.email` is updated, the `(schoolId, email)` unique constraint on the `User` table SHALL still be satisfied; if the new email would collide with another Active_User at the same school, THE OAuth_Service SHALL reject the login and display: "The new Gmail address you are using conflicts with another account at your school. Contact your administrator."

---

### Requirement 8: Backward Compatibility for Password-Based Accounts

**User Story:** As an existing staff member who has not yet linked a Google account, I want to continue signing in with my email and temporary password so that my access is not disrupted during the migration period.

#### Acceptance Criteria

1. WHILE a `User` row has a non-null `passwordHash` and a null `googleSub`, THE OAuth_Service SHALL continue to support password-based authentication via the existing `/api/auth/login` route for that user.
2. THE existing `/api/auth/change-password` route SHALL continue to function for users with non-null `passwordHash`.
3. WHEN a password-based user completes Google account linking via an invite flow, THE OAuth_Service SHALL set `passwordHash = null` for that user, disabling password-based login from that point on.
4. THE OAuth_Service SHALL NOT force existing password-based users to link Google accounts — the migration is opt-in via the invite flow triggered by the Principal.
5. IF a password-based login attempt is made for a user who has already linked a Google account (`googleSub` is non-null and `passwordHash` is null), THEN THE OAuth_Service SHALL return: "This account uses Google sign-in. Please use the 'Sign in with Google' button."

---

### Requirement 9: Session Lifecycle

**User Story:** As a user, I want my session to behave the same as before so that the authentication method change is transparent to ongoing work.

#### Acceptance Criteria

1. THE OAuth_Service SHALL issue `bidii_session` cookies after Google identity verification using the same `createSession()` function as the existing password flow.
2. THE `bidii_session` cookie SHALL be set with `httpOnly = true`, `secure = true` in production, `sameSite = lax`, `path = /`, and `maxAge = 604800` (7 days).
3. WHEN `getCurrentUser()` is called, THE OAuth_Service SHALL return the authenticated user by looking up the session token hash in the `Session` table, unchanged from the current implementation.
4. WHEN a user clicks logout, THE OAuth_Service SHALL call `destroySession()` to delete the `Session` row and clear the `bidii_session` cookie, unchanged from the current implementation.
5. WHEN a session expires (past `expiresAt`), THE OAuth_Service SHALL treat the user as unauthenticated, requiring a new Google OAuth flow.
6. THE OAuth_Service SHALL NOT store Google access tokens or refresh tokens in the database — only the Bidii session token hash is persisted in the `Session` table.

---

### Requirement 10: Security Constraints

**User Story:** As a system, I need OAuth flows to be protected against common attacks so that user accounts cannot be hijacked.

#### Acceptance Criteria

1. THE OAuth_Service SHALL use PKCE (Proof Key for Code Exchange) for all OAuth authorization flows, generating a cryptographically random `code_verifier` of at least 32 bytes and deriving the `code_challenge` using the S256 method.
2. THE OAuth_Service SHALL generate a cryptographically random `state` parameter for every OAuth authorization request and validate that the returned `state` matches before processing the callback.
3. IF the `state` parameter in the OAuth callback does not match the value stored in the server-side session or signed cookie, THEN THE OAuth_Service SHALL reject the callback and return HTTP 400.
4. THE OAuth_Service SHALL verify the Google ID token using Google's public keys obtained from the JWKS endpoint (`https://www.googleapis.com/oauth2/v3/certs`), and SHALL NOT trust any claims from an unverified token.
5. THE OAuth_Service SHALL validate the `aud` claim equals `GOOGLE_CLIENT_ID`, the `iss` claim is in `{accounts.google.com, https://accounts.google.com}`, and the `exp` claim is in the future before accepting an ID token.
6. THE OAuth_Service SHALL NOT log or expose `GOOGLE_CLIENT_SECRET`, OAuth access tokens, or Google refresh tokens in application logs, error responses, or audit records.
7. THE Invite_Token SHALL be generated using at least 32 bytes of cryptographically random data, stored only as a hash in the database, and transmitted only in the invite URL.
8. THE OAuth_Service SHALL apply consistent response timing for all authentication failures to prevent timing-based account enumeration.

---

### Requirement 11: Preservation of Existing School Isolation and Permissions

**User Story:** As a system operator, I want the introduction of Google OAuth to not weaken any existing school-isolation, audit-trail, or permission rules so that multi-tenancy and RBAC remain intact.

#### Acceptance Criteria

1. WHEN an OAuth-authenticated user accesses any API route, THE OAuth_Service SHALL continue to scope all database queries and mutations to `User.schoolId`, unchanged from the existing behavior.
2. THE `staffRoleId`, `userStaffRoles`, and all `RolePermission` rows SHALL remain authoritative for permission checks — `getCurrentUser()` and `requireRole()` are called the same way regardless of how the session was created.
3. THE audit log (`AuditLog`) and permission audit log (`PermissionAuditLog`) tables SHALL continue to record all relevant actions using the same `performedById` foreign key, regardless of whether the session was established via Google OAuth or password.
4. WHEN a user's `User.email` is updated due to a Gmail address change (per Requirement 7), THE OAuth_Service SHALL write an `AuditLog` entry scoped to the correct `schoolId`.
5. THE introduction of Google OAuth SHALL NOT affect `Teacher`, `Student`, `Session`, `Department`, `Subject`, `SchoolClass`, or any other existing table — only the `User` table and a new `UserInvite` table are modified.

---

### Requirement 12: Error Handling and User-Facing Messages

**User Story:** As a user, I want clear error messages for all failure scenarios so that I know what went wrong and what action to take next.

#### Acceptance Criteria

1. WHEN Google OAuth fails for any reason during signup, THE OAuth_Service SHALL display a human-readable message at `/signup` and preserve any school-details form data the user had entered.
2. WHEN Google OAuth fails for any reason during login, THE OAuth_Service SHALL display a human-readable message at `/login` without revealing whether the account exists.
3. WHEN Google OAuth fails during invite linking, THE OAuth_Service SHALL display a human-readable message on the invite page without invalidating the Invite_Token.
4. IF the user takes longer than the OAuth state TTL to complete an OAuth round-trip (e.g. left the browser idle), THEN THE OAuth_Service SHALL redirect the user to the starting page (signup, login, or invite) with the message: "Your sign-in session expired. Please try again."
5. THE OAuth_Service SHALL never display raw error codes, stack traces, or internal identifiers to end users in any error message.
6. IF the Google ID token's `email_verified` claim is `false`, THEN THE OAuth_Service SHALL reject the authentication attempt and display: "Your Google account email is not verified. Please verify your Google account and try again."
