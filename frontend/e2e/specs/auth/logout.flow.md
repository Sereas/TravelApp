# Auth — Sign Out (1 test)

Uses `page` fixture (authenticated via storageState from global-setup).

---

## Test 5: Sign out redirects to login page

**Purpose:** Verify the full sign-out flow: open profile menu, confirm user email is shown, click "Sign out", verify redirect to `/login`.

**Fixture:** `page` (authenticated via storageState from global-setup)

**Why this is safe:** `supabase.auth.signOut()` invalidates the refresh token server-side, but the JWT access token in storageState remains valid until expiry (~1 hour). Each subsequent test creates a fresh browser context from storageState, and all tests complete well within the access token's lifetime. No other tests are affected.

### Steps

1. Navigate to `/trips`
2. Assert: heading "My Trips" is visible (page loaded with auth)
3. Click the "Profile menu" button (`UserNav.tsx:44` — `aria-label="Profile menu"`)
4. Assert: text "Signed in as" is visible (`UserNav.tsx:55`)
5. Assert: button "Sign out" is visible (`UserNav.tsx:66`)
6. **Screenshot:** `05-profile-menu-open.png` — dropdown open with email and sign-out button
7. Click "Sign out" button
8. Assert: URL changes to contain `/login` (timeout 10s — `window.location.href = "/login"` from `UserNav.tsx:36`)
9. Assert: heading "Welcome back" is visible (login page rendered after sign-out)
10. **Screenshot:** `06-signed-out.png` — login page after sign-out redirect

### Pass criteria

- Profile dropdown opens and shows the signed-in email
- Clicking "Sign out" triggers `supabase.auth.signOut()` + redirect
- URL changes to `/login`
- "Welcome back" heading renders (session cleared, login page shown)

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `05-profile-menu-open.png` | Trips page with profile dropdown open — "Signed in as" text and "Sign out" button visible |
| `06-signed-out.png` | Login page after sign-out — "Welcome back" heading visible, confirming redirect |
