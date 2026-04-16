# Auth — Login (4 tests)

All tests use `noAuthPage` — a fresh browser context with no stored session.

---

## Test 1: Redirects unauthenticated user to /login

**Purpose:** Verify that the Next.js middleware redirects unauthenticated users away from protected routes.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/trips` (protected route) using `noAuthPage`
2. Assert: URL redirected to contain `/login`
3. Assert: heading "Welcome back" (`<h1>` from `LoginForm.tsx:135`) is visible
4. **Screenshot:** `01-redirect-to-login.png`

### Pass criteria

- URL changes from `/trips` to `/login`
- "Welcome back" heading renders (login page loaded, not a blank redirect)

### Required artifacts

| Artifact                   | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `01-redirect-to-login.png` | Login page after redirect — "Welcome back" heading visible, email/password fields empty |

---

## Test 2: Login with valid credentials redirects to /trips

**Purpose:** Verify that entering valid E2E credentials signs the user in and redirects to the trips list.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login` via `LoginPage.goto()`
2. Assert: "Welcome back" heading is visible (page loaded)
3. Fill "Email" input with `E2E_EMAIL` env var
4. Fill "Password" input with `E2E_PASSWORD` env var
5. Click "Sign in" button
6. Assert: URL changes to `/trips` (timeout 20s — Supabase auth + redirect)
7. Assert: heading "My Trips" is visible (authenticated page rendered)
8. **Screenshot:** `02-login-success.png`

### Pass criteria

- Supabase auth succeeds with the E2E test credentials
- `router.push("/trips")` fires after login, URL ends with `/trips`
- "My Trips" heading renders (auth session is valid, data loads)

### Required artifacts

| Artifact               | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `02-login-success.png` | Trips list page after successful login — "My Trips" heading visible |

---

## Test 3: Login with invalid password shows error

**Purpose:** Verify that wrong credentials show an error banner and do NOT redirect.

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login` via `LoginPage.goto()`
2. Assert: "Welcome back" heading is visible
3. Fill "Email" input with `E2E_EMAIL` env var
4. Fill "Password" input with `"this-password-is-wrong-intentionally"`
5. Click "Sign in" button
6. Assert: an element with `role="alert"` is visible (ErrorBanner from `LoginForm.tsx`) — Supabase returns "Invalid login credentials"
7. Assert: URL still contains `/login` (no redirect happened)
8. **Screenshot:** `03-login-invalid-password.png`

### Pass criteria

- Error banner appears with Supabase's error message
- User stays on `/login` — no redirect to `/trips`

### Required artifacts

| Artifact                        | Description                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `03-login-invalid-password.png` | Login page with error banner visible — "Invalid login credentials" message shown |

---

## Test 4: Google OAuth initiates and shows Google account selector

**Purpose:** Verify that clicking "Continue with Google" triggers Supabase OAuth redirect to Google's account selector. The test validates the OAuth flow initiates correctly — it does NOT complete sign-in (no Google credentials in E2E).

**Fixture:** `noAuthPage` (no auth cookies)

### Steps

1. Navigate to `/login`
2. Assert: heading "Welcome back" is visible
3. Assert: "Continue with Google" button is visible (`LoginForm.tsx:261`)
4. Click "Continue with Google" button
5. Assert: page navigates to `accounts.google.com` domain (timeout 15s — OAuth redirect through Supabase)
6. **Screenshot:** `04-google-oauth-prompt.png` — the Google account selector / sign-in page

### Pass criteria

- Page navigates away from `/login` to Google's OAuth domain
- Google account selector or sign-in form renders
- No error banner on `/login` before redirect (Supabase OAuth initiation succeeded)

### Required artifacts

| Artifact                     | Description                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| `04-google-oauth-prompt.png` | Google account selector / sign-in page after OAuth redirect from Supabase |
