# Create Trip — Date Variations (4 tests)

All tests create a trip through the UI dialog on `/trips`, then verify the resulting date display on the trip detail page. Each test uses the `page` (authenticated) + `apiClient` (teardown) fixtures.

**UI references:**

- Create dialog: `CreateTripDialog.tsx` — "Trip name" input, "Start date" / "End date" DatePicker buttons, "Create trip" submit
- DatePicker: `date-picker.tsx` — Calendar `mode="single"`, auto-closes on selection, shows `"MMM d, yyyy"` when set
- Detail page date: `TripDateRangePicker.tsx` — `button[aria-label="Date range"]`, shows "Set dates" / single date / "date — date" range

---

## Test 1: No dates — Set dates placeholder on detail

**Purpose:** Create a trip with only a name (no dates) and verify the detail page shows the "Set dates" placeholder.

**Steps:**

1. Navigate to `/trips`, wait for loaded
2. Open create dialog (click "New trip" or "Create your first trip")
3. Fill "Trip name" with unique name
4. **Screenshot:** `01-create-dialog-no-dates.png` — dialog with name filled, both date pickers showing placeholder
5. Click "Create trip", wait for navigation to `/trips/{id}`
6. Assert: `button[aria-label="Date range"]` contains "Set dates"
7. **Screenshot:** `02-detail-no-dates.png` — detail page with "Set dates" button

### Pass criteria

- Trip created successfully without dates
- Detail page shows "Set dates" (not a formatted date)

### Required artifacts

| Artifact                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `01-create-dialog-no-dates.png` | Create dialog with name filled, no dates selected  |
| `02-detail-no-dates.png`        | Detail page header showing "Set dates" placeholder |

---

## Test 2: Start date only — single date on detail

**Purpose:** Pick only a start date via the calendar in the create dialog. Verify calendar renders correctly and the detail page shows a single formatted date without a range separator.

**Steps:**

1. Navigate to `/trips`, open create dialog, fill name
2. Click "Start date" button — calendar popover opens
3. Navigate calendar to June 2026
4. **Screenshot:** `03-calendar-start-date.png` — calendar popover showing June 2026
5. Click June 15 — popover closes, button shows "Jun 15, 2026"
6. **Screenshot:** `04-dialog-start-only.png` — dialog with start date set, end date still placeholder
7. Click "Create trip", wait for `/trips/{id}`
8. Assert: date range button contains "Jun 15, 2026"
9. Assert: date range button does NOT contain "\u2014" (no range separator)
10. **Screenshot:** `05-detail-start-only.png` — detail page showing single date

### Pass criteria

- Calendar opens, navigates to correct month, day is clickable
- Only start date shown on detail (no range, no "Set dates")

### Required artifacts

| Artifact                     | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `03-calendar-start-date.png` | Start date calendar popover open at June 2026            |
| `04-dialog-start-only.png`   | Dialog with "Jun 15, 2026" start, "End date" placeholder |
| `05-detail-start-only.png`   | Detail page showing "Jun 15, 2026" only                  |

---

## Test 3: End date only — single date on detail

**Purpose:** Pick only an end date (skip start date). Since no start date is set, the end date picker has no `fromDate` constraint — all dates are selectable.

**Steps:**

1. Navigate to `/trips`, open create dialog, fill name
2. Skip start date entirely
3. Click "End date" button — calendar popover opens (no constraints)
4. Navigate calendar to July 2026
5. **Screenshot:** `06-calendar-end-date.png` — end date calendar at July 2026
6. Click July 20 — popover closes, button shows "Jul 20, 2026"
7. **Screenshot:** `07-dialog-end-only.png` — dialog with end date set, start date still placeholder
8. Click "Create trip", wait for `/trips/{id}`
9. Assert: date range button contains "Jul 20, 2026"
10. Assert: date range button does NOT contain "\u2014"
11. **Screenshot:** `08-detail-end-only.png` — detail page showing single date

### Pass criteria

- End date selectable without start date constraint
- Only end date shown on detail

### Required artifacts

| Artifact                   | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `06-calendar-end-date.png` | End date calendar popover at July 2026, all days enabled |
| `07-dialog-end-only.png`   | Dialog with "Start date" placeholder, "Jul 20, 2026" end |
| `08-detail-end-only.png`   | Detail page showing "Jul 20, 2026" only                  |

---

## Test 4: Both dates — duration badge and date range

**Purpose:** Pick both start and end dates. Verify the end date picker is constrained by the start date (earlier days disabled), the duration badge appears, and the detail page shows a full date range.

**Steps:**

1. Navigate to `/trips`, open create dialog, fill name
2. Pick start date: June 10, 2026 (via calendar)
3. Click "End date" button — calendar opens at June 2026 with `fromDate` constraint
4. **Screenshot:** `09-calendar-end-constrained.png` — calendar showing June 2026, days 1-9 disabled (before June 10)
5. Pick June 19 — popover closes
6. Assert: duration badge "10 days" is visible
7. **Screenshot:** `10-dialog-both-dates.png` — dialog with both dates + "10 days" badge
8. Click "Create trip", wait for `/trips/{id}`
9. Assert: date range button contains "Jun 10, 2026"
10. Assert: date range button contains "Jun 19, 2026"
11. **Screenshot:** `11-detail-both-dates.png` — detail page showing "Jun 10, 2026 — Jun 19, 2026"

### Pass criteria

- End date calendar disables days before start date
- Duration badge shows correct day count (inclusive: 19 - 10 + 1 = 10)
- Detail page shows full range with "\u2014" separator

### Required artifacts

| Artifact                          | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `09-calendar-end-constrained.png` | End date calendar with days before June 10 disabled/greyed |
| `10-dialog-both-dates.png`        | Dialog with both dates set and "10 days" duration badge    |
| `11-detail-both-dates.png`        | Detail page showing "Jun 10, 2026 — Jun 19, 2026" range    |
