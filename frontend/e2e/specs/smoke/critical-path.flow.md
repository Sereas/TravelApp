# Smoke — Critical Path

Two tests that validate the core infrastructure and the full user journey.

---

## Test 1: Authenticated user can see trips list

**Purpose:** Verify that the Supabase auth session (saved by global-setup) works and the main page renders.

**Precondition:** The E2E account has at least one trip (the seeded "France Summer '26" trip). The list is NOT empty.

### Steps

1. Navigate to `/trips`
2. Assert: heading "My Trips" (`<h1>`) is visible — confirms auth session is valid and the page rendered
3. **Screenshot:** `01-trips-list.png` — the trips list page with "My Trips" heading

**Note:** This test only verifies the page header renders (auth works). It does NOT test the trip list contents, card rendering, or trip count.

### Pass criteria

- The page loads without redirect to `/login` (auth cookies from global-setup are valid)
- "My Trips" heading renders within the default timeout

### Required artifacts

| Artifact            | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `01-trips-list.png` | The trips list page showing "My Trips" heading and at least the seeded France trip |

> If this test fails, all other E2E tests will fail too — fix it first.

---

## Test 2: Full critical path — create, schedule, share, view, delete

**Purpose:** End-to-end journey covering every major feature area in one flow. Each step produces a proof screenshot.

**Timeout:** 180 seconds

### Steps

#### 1. Create trip via API

- Create a trip named `E2E CriticalPath {timestamp}` with dates Jul 1–3, 2026
- No UI interaction — API setup only

#### 2. Navigate to trips list

- Go to `/trips`
- Assert: the newly created trip card is visible in the list
- **Screenshot:** `01-trips-list-with-new-trip.png`

#### 3. Open the new trip

- Click the trip card to navigate to `/trips/{id}`
- Wait for the page to load (tab navigation visible)
- Assert: trip name is visible as an inline-editable `<button>`
- Assert: empty state is shown (EmptyLocationsCTA with "Ready to build your pool?" heading) — no locations yet
- **Screenshot:** `02-trip-empty-state.png`

#### 4. Add a location via API

- Add one location named "E2E Critical Location" (city: "TestCity") via API
- Reload the page to reflect the new data
- Assert: location card "E2E Critical Location" is visible in the Places tab
- **Screenshot:** `03-trip-with-location.png`

#### 5. Switch to Itinerary tab

- Click the "Itinerary" tab
- Assert: "Generate" button is visible (no days exist yet)
- **Screenshot:** `04-itinerary-generate-button.png`

#### 6. Generate days

- Click the "Generate" button
- Assert: day rail shows buttons containing "Jul 1", "Jul 2", "Jul 3"
- **Screenshot:** `05-itinerary-days-generated.png`

#### 7. Schedule the location to the first day

- Click "Add locations" button on the first day card
- Assert: "Add locations to plan" dialog opens
- Click the "E2E Critical Location" button inside the dialog
- Click the "Add {N}" / "Add locations" submit button
- Assert: dialog closes
- Assert: "E2E Critical Location" text appears in the day timeline
- **Screenshot:** `06-location-scheduled.png`

#### 8. Enable trip sharing

- Click the "Share" button in the trip header
- Assert: share dialog is visible with "Enable Link Sharing" button
- Click "Enable Link Sharing"
- Assert: "Link sharing is enabled" text appears
- Assert: a `<span>` containing `/shared/` URL text is visible
- **Screenshot:** `07-share-dialog-enabled.png`
- Extract the share URL from the span text
- Close the dialog (Escape key)

#### 9. View shared link as unauthenticated visitor

- Open the share URL in a separate browser context (no auth cookies)
- Assert: trip name is visible as an `<h1>` heading (shared/read-only view)
- Assert: "Edit trip" button is NOT present (read-only mode enforced)
- **Screenshot:** `08-shared-view-readonly.png`

#### 10. Cleanup

- Delete the trip via API

### Required artifacts

| Artifact                           | Description                                                     |
| ---------------------------------- | --------------------------------------------------------------- |
| `01-trips-list-with-new-trip.png`  | Trips list page with the newly created trip card visible        |
| `02-trip-empty-state.png`          | Trip detail page with no locations — EmptyLocationsCTA visible  |
| `03-trip-with-location.png`        | Trip detail page with "E2E Critical Location" card visible      |
| `04-itinerary-generate-button.png` | Itinerary tab with "Generate" button (no days yet)              |
| `05-itinerary-days-generated.png`  | Itinerary tab with day rail showing Jul 1–3                     |
| `06-location-scheduled.png`        | Location scheduled in the day timeline                          |
| `07-share-dialog-enabled.png`      | Share dialog with link sharing enabled and URL visible          |
| `08-shared-view-readonly.png`      | Shared trip page — read-only view, h1 heading, no edit controls |

### Key UI patterns validated

| Pattern                      | Where                                            |
| ---------------------------- | ------------------------------------------------ |
| Trip list rendering          | Step 2 (new trip card appears in list)           |
| Empty trip state             | Step 3 (EmptyLocationsCTA with action cards)     |
| Location card rendering      | Step 4 (card appears after API add + reload)     |
| Itinerary day generation     | Step 6 (day rail populates from date range)      |
| Add-locations-to-plan dialog | Step 7 (multi-select, submit, dialog close)      |
| Location scheduling          | Step 7 (location appears in day timeline)        |
| Share link generation        | Step 8 (dialog flow, URL extraction)             |
| Shared view read-only mode   | Step 9 (heading renders as h1, no edit controls) |
