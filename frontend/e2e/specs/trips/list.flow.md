# Trips List — Visibility & Deletion (2 tests)

Both tests use the `page` (authenticated) fixture on `/trips`.

**UI references:**

- Trip card: `TripCard.tsx` — `<h3>` with trip name, delete button `aria-label="Delete {name}"` (hidden, revealed on hover)
- Delete confirm: `ConfirmDialog.tsx` — title "Delete trip?", description includes trip name, buttons "Cancel" / "Delete trip"
- Delete button visibility: `opacity-0 group-hover:opacity-100` — requires hovering the card to reveal

---

## Test 1: Created trip visible in list

**Purpose:** Verify an API-created trip appears as a card in the trips list.

**Fixture:** `page` + `testTrip` (auto-created/cleaned via fixture)

**Steps:**

1. Navigate to `/trips`, wait for loaded
2. Assert: `h3` heading with `testTrip.name` is visible
3. **Screenshot:** `01-trip-in-list.png` — trips list showing the card

### Pass criteria

- Trip card with correct name is visible in the list

### Required artifacts

| Artifact              | Description                                     |
| --------------------- | ----------------------------------------------- |
| `01-trip-in-list.png` | Trips list page with the test trip card visible |

---

## Test 2: Delete trip from UI removes from list

**Purpose:** Create a trip via API, delete it through the UI (hover → trash → confirm dialog), and verify it disappears from the list. The confirmation dialog intermediate state must be captured.

**Fixture:** `page` + `apiClient`

**Steps:**

1. Create trip via API, register for teardown
2. Navigate to `/trips`, wait for loaded
3. Assert: trip card with name is visible
4. **Screenshot:** `02-trip-before-delete.png` — list showing the trip card
5. Hover over the trip card heading to reveal the delete button
6. Click `button[aria-label="Delete {name}"]`
7. Assert: dialog title "Delete trip?" is visible
8. Assert: dialog description mentions permanent deletion
9. **Screenshot:** `03-delete-confirmation.png` — confirmation dialog open over the trips list
10. Click "Delete trip" button inside the dialog
11. Assert: trip card is no longer visible (timeout 10s — API call + UI update)
12. **Screenshot:** `04-trip-deleted.png` — trips list without the deleted card

### Pass criteria

- Confirmation dialog shows correct title and description
- After confirming, the trip card disappears without page reload
- No orphaned trips (registered for teardown as safety net)

### Required artifacts

| Artifact                     | Description                              |
| ---------------------------- | ---------------------------------------- |
| `02-trip-before-delete.png`  | Trips list with the trip card visible    |
| `03-delete-confirmation.png` | "Delete trip?" confirmation dialog open  |
| `04-trip-deleted.png`        | Trips list after deletion — card is gone |
