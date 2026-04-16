# Auth — Signup & Password Reset Edge Cases (4 tests)

All tests start on `/login` with `noAuthPage` and test validation/error paths. None create a real account.

**Note on role="alert":** Next.js renders a hidden route-announcer `<div>` with `role="alert"`, so we use `.getByRole("alert").first()` to target the ErrorBanner specifically.

---

## Test 6: Signup — existing email shows error

**Purpose:** Verify that Supabase rejects duplicate signups with "User already registered".

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login`
2. Assert: heading "Welcome back" is visible
3. Click "Create one" button to switch to signup mode (`LoginForm.tsx:298`)
4. Assert: heading changes to "Create an account" (`LoginForm.tsx:135`)
5. Fill "Email" with `E2E_EMAIL` env var (already registered)
6. Fill "Password" with `"SomePass123"`
7. Fill "Confirm password" with `"SomePass123"`
8. Click "Create account" button
9. Assert: first `role="alert"` element is visible (timeout 15s — Supabase round-trip)
10. Assert: alert text contains "already registered" (case-insensitive)
11. **Screenshot:** `07-signup-existing-email.png`

### Pass criteria

- Supabase API returns the "already registered" error
- ErrorBanner renders with the error message
- No redirect — user stays on the login/signup page

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `07-signup-existing-email.png` | Signup form with "already registered" error banner visible |

---

## Test 7: Signup — mismatched passwords shows error

**Purpose:** Verify client-side validation catches password mismatch before hitting Supabase.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login`
2. Assert: heading "Welcome back" is visible
3. Click "Create one" button to switch to signup mode
4. Assert: heading changes to "Create an account"
5. Fill "Email" with `"test-mismatch@example.com"`
6. Fill "Password" with `"Password1"`
7. Fill "Confirm password" with `"Password2"` (mismatch)
8. Click "Create account" button
9. Assert: first `role="alert"` element is visible (timeout 5s — client-side, no network)
10. Assert: alert text contains "Passwords do not match" (`LoginForm.tsx:51`)
11. **Screenshot:** `08-signup-password-mismatch.png`

### Pass criteria

- Client-side validation fires immediately (no Supabase call)
- "Passwords do not match" error shown in ErrorBanner
- No redirect, no network call to Supabase auth

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `08-signup-password-mismatch.png` | Signup form with "Passwords do not match" error banner visible |

---

## Test 8: Forgot password — empty email shows error

**Purpose:** Verify that clicking "Forgot your password?" with an empty email field shows a client-side validation error.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login`
2. Assert: heading "Welcome back" is visible
3. Leave email field empty (do not fill it)
4. Click "Forgot your password?" button (`LoginForm.tsx:245`)
5. Assert: first `role="alert"` element is visible (timeout 5s — client-side)
6. Assert: alert text contains "Enter your email address first" (`LoginForm.tsx:108`)
7. **Screenshot:** `09-forgot-empty-email.png`

### Pass criteria

- Client-side validation fires immediately
- "Enter your email address first" error shown
- No network call to Supabase password reset endpoint

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `09-forgot-empty-email.png` | Login page with "Enter your email address first" error banner visible |

---

## Test 9: Forgot password — valid email shows response

**Purpose:** Verify that clicking "Forgot your password?" with a valid email gets a response from Supabase — either a success message or an error banner. The test accepts either outcome because Supabase may accept or reject the email depending on configuration.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login`
2. Assert: heading "Welcome back" is visible
3. Fill "Email" with `E2E_EMAIL` env var
4. Click "Forgot your password?" button
5. Assert: either "Password reset link sent to" text OR first `role="alert"` element is visible (timeout 15s — Supabase round-trip)
6. **Screenshot:** `10-forgot-valid-email.png`

### Pass criteria

- The UI responds to the password reset request (not stuck in loading state)
- Either success message ("Password reset link sent to ...") or error banner is shown
- This test validates the UI reacts, not the specific Supabase outcome

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `10-forgot-valid-email.png` | Login page showing either "Password reset link sent" success message or an error banner from Supabase |
