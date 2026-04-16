# Trip Filters — Upcoming & Past Tabs (2 tests)

Both tests create a past trip + upcoming trip via API, then verify tab filtering. Uses `page` + `apiClient` fixtures.

**Filter logic** (`trips/page.tsx`):
- `isUpcoming(trip)`: `true` if no `end_date`, OR `end_date + "T23:59:59" >= now`
- All tab: all trips
- Upcoming tab: `trips.filter(isUpcoming)`
- Past tab: `trips.filter(t => !isUpcoming(t))`

**Trip card dates** (`TripCard.tsx` `formatDateDisplay`):
- Both dates: `"Jun 1, 2024 — Jun 10, 2024"`
- No dates: `"Dates still open"`

---

## Test 1: Upcoming tab shows future and ongoing trips

**Purpose:** Verify the Upcoming filter hides past trips and shows only trips with `end_date` in the future (or no end_date).

**Fixture:** `page` + `apiClient`

**Steps:**
1. Create past trip via API: `start_date: "2024-06-01"`, `end_date: "2024-06-10"`
2. Create upcoming trip via API: `start_date: "2026-09-01"`, `end_date: "2026-09-15"`
3. Navigate to `/trips`, wait for loaded
4. Assert: both trip cards visible on All tab (default)
5. **Screenshot:** `01-all-tab-both-trips.png` — All tab with both trips, dates visible on cards
6. Click "Upcoming" tab
7. Assert: upcoming trip card is visible
8. Assert: past trip card is NOT visible
9. **Screenshot:** `02-upcoming-tab-filtered.png` — Upcoming tab with only the future trip
10. Cleanup both trips

### Pass criteria
- All tab shows both trips
- Upcoming tab hides the past trip, shows only the upcoming trip
- Trip cards display formatted date ranges

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `01-all-tab-both-trips.png` | All tab selected, both past and upcoming trip cards with dates |
| `02-upcoming-tab-filtered.png` | Upcoming tab selected, only future trip visible |

---

## Test 2: Past tab shows ended trips

**Purpose:** Verify the Past filter shows only trips whose `end_date` is earlier than today, hiding upcoming/ongoing trips.

**Fixture:** `page` + `apiClient`

**Steps:**
1. Create past trip via API: `start_date: "2024-06-01"`, `end_date: "2024-06-10"`
2. Create upcoming trip via API: `start_date: "2026-09-01"`, `end_date: "2026-09-15"`
3. Navigate to `/trips`
4. Click "Past" tab
5. Assert: past trip card is visible
6. Assert: upcoming trip card is NOT visible
7. **Screenshot:** `03-past-tab-filtered.png` — Past tab with only the ended trip
8. Cleanup both trips

### Pass criteria
- Past tab hides the upcoming trip, shows only the past trip
- Past trip card shows its date range

### Required artifacts

| Artifact | Description |
|----------|-------------|
| `03-past-tab-filtered.png` | Past tab selected, only ended trip visible |
