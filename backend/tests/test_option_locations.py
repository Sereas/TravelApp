"""Tests for option-locations API: list/add/update/delete/batch."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_trip_day_option_and_location(mock_supabase_trips_and_days, mock_user_id):
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())
    location_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    # Seed trip and day
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    # Seed option and location rows
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._locations_store.append({"location_id": location_id, "trip_id": trip_id})
    return trip_id, day_id, option_id, location_id, mock_sb


def test_list_option_locations_empty_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, _, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"location_id": location_id, "sort_order": 0, "time_period": "morning"}
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body,
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["option_id"] == option_id
        assert data["location_id"] == location_id
        assert data["sort_order"] == 0
        assert data["time_period"] == "morning"
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_location_not_in_trip_returns_400(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    # Change location trip_id so it no longer belongs to trip
    mock_sb._locations_store[0]["trip_id"] = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"location_id": location_id, "sort_order": 0, "time_period": "morning"}
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body,
        )
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_list_option_locations_returns_200_ordered(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    other_location_id = str(uuid4())
    ol_id_1 = str(uuid4())
    ol_id_2 = str(uuid4())
    mock_sb._locations_store.append({"location_id": other_location_id, "trip_id": trip_id})
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_2,
            "option_id": option_id,
            "location_id": other_location_id,
            "sort_order": 2,
            "time_period": "evening",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_1,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 1,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        # Ordered by sort_order
        assert data[0]["sort_order"] == 1
        assert data[0]["location_id"] == location_id
        assert "id" in data[0]
        assert data[1]["sort_order"] == 2
        assert data[1]["location_id"] == other_location_id
        assert "id" in data[1]
    finally:
        app.dependency_overrides.clear()


def test_update_option_location_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id = str(uuid4())
    mock_sb._option_locations_store.append(
        {
            "id": ol_id,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"sort_order": 3, "time_period": "evening"}
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id}",
            json=body,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == ol_id
        assert data["sort_order"] == 3
        assert data["time_period"] == "evening"
    finally:
        app.dependency_overrides.clear()


def test_update_option_location_empty_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id = str(uuid4())
    mock_sb._option_locations_store.append(
        {
            "id": ol_id,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id}",
            json={},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_remove_location_from_option_returns_204(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id = str(uuid4())
    mock_sb._option_locations_store.append(
        {
            "id": ol_id,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id}",
        )
        assert r.status_code == 204
        assert not any(
            ol.get("id") == ol_id
            for ol in mock_sb._option_locations_store
        )
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_to_option_returns_201_and_same_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, first_loc_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    second_loc_id = str(uuid4())
    mock_sb._locations_store.append({"location_id": second_loc_id, "trip_id": trip_id})

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = [
        {"location_id": first_loc_id, "sort_order": 0, "time_period": "morning"},
        {"location_id": second_loc_id, "sort_order": 1, "time_period": "afternoon"},
    ]
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=body,
        )
        assert r.status_code == 201
        data = r.json()
        assert [d["location_id"] for d in data] == [first_loc_id, second_loc_id]
        assert "id" in data[0]
        assert "id" in data[1]
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_empty_array_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, _, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=[],
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_option_locations_returns_200_and_new_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    loc2_id = str(uuid4())
    ol_id_1 = str(uuid4())
    ol_id_2 = str(uuid4())
    mock_sb._locations_store.append({"location_id": loc2_id, "trip_id": trip_id, "name": "Loc2"})
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_1,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_2,
            "option_id": option_id,
            "location_id": loc2_id,
            "sort_order": 1,
            "time_period": "afternoon",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
            json={"ol_ids": [ol_id_2, ol_id_1]},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        assert data[0]["location_id"] == loc2_id
        assert data[0]["sort_order"] == 0
        assert data[1]["location_id"] == location_id
        assert data[1]["sort_order"] == 1
    finally:
        app.dependency_overrides.clear()


def test_reorder_option_locations_empty_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, _, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
            json={"ol_ids": []},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_option_locations_duplicate_id_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id = str(uuid4())
    mock_sb._option_locations_store.append(
        {
            "id": ol_id,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
            json={"ol_ids": [ol_id, ol_id]},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_option_locations_ids_mismatch_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id = str(uuid4())
    mock_sb._option_locations_store.append(
        {
            "id": ol_id,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    bogus_ol_id = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
            json={"ol_ids": [ol_id, bogus_ol_id]},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_option_locations_no_jwt_returns_401(client: TestClient):
    trip_id = uuid4()
    day_id = uuid4()
    option_id = uuid4()
    ol_id = uuid4()
    r = client.patch(
        f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
        json={"ol_ids": [str(ol_id)]},
    )
    assert r.status_code == 401


def test_add_location_to_option_no_jwt_returns_401(client: TestClient):
    trip_id = uuid4()
    day_id = uuid4()
    option_id = uuid4()
    loc_id = uuid4()
    body = {"location_id": str(loc_id), "sort_order": 0, "time_period": "morning"}
    r = client.post(
        f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        json=body,
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# RED tests: surrogate ol_id / duplicate-locations feature
# These tests FAIL against the current code and define the target behaviour
# after the surrogate PK migration on option_locations.
# ---------------------------------------------------------------------------


def test_add_same_location_twice_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Adding the same location_id twice to an option must succeed (201 both times).
    Each insertion must return a distinct surrogate `id` (ol_id).
    Currently FAILS because the router returns 409 on duplicate (option_id, location_id).
    """
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        body_first = {"location_id": location_id, "sort_order": 0, "time_period": "morning"}
        r1 = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body_first,
        )
        assert r1.status_code == 201, f"first add failed: {r1.status_code} {r1.text}"

        body_second = {"location_id": location_id, "sort_order": 1, "time_period": "afternoon"}
        r2 = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body_second,
        )
        assert r2.status_code == 201, f"second add failed: {r2.status_code} {r2.text}"

        data1 = r1.json()
        data2 = r2.json()
        # Both rows must share the same location_id …
        assert data1["location_id"] == location_id
        assert data2["location_id"] == location_id
        # … but have distinct surrogate ids
        assert "id" in data1, "response must include surrogate ol id"
        assert "id" in data2, "response must include surrogate ol id"
        assert data1["id"] != data2["id"], "surrogate ids must be distinct for each row"
    finally:
        app.dependency_overrides.clear()


def test_batch_add_with_duplicate_location_ids_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Batch-adding [loc_A, loc_B, loc_A] to an option must succeed (201) and return 3 rows.
    items[0] and items[2] must share location_id but have different surrogate `id` values.
    Currently FAILS because the router rejects duplicates in the batch with 409.
    """
    trip_id, day_id, option_id, loc_a_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    loc_b_id = str(uuid4())
    mock_sb._locations_store.append({"location_id": loc_b_id, "trip_id": trip_id})

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = [
        {"location_id": loc_a_id, "sort_order": 0, "time_period": "morning"},
        {"location_id": loc_b_id, "sort_order": 1, "time_period": "afternoon"},
        {"location_id": loc_a_id, "sort_order": 2, "time_period": "evening"},
    ]
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=body,
        )
        assert r.status_code == 201, f"batch add failed: {r.status_code} {r.text}"
        data = r.json()
        assert len(data) == 3, f"expected 3 items, got {len(data)}"
        assert data[0]["location_id"] == loc_a_id
        assert data[2]["location_id"] == loc_a_id
        assert "id" in data[0], "each item must include surrogate ol id"
        assert "id" in data[2], "each item must include surrogate ol id"
        assert data[0]["id"] != data[2]["id"], "duplicate location must get distinct surrogate ids"
    finally:
        app.dependency_overrides.clear()


def test_remove_one_duplicate_keeps_the_other(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """When the same location appears twice in an option, deleting by ol_id must remove
    only that row, leaving the other intact.
    Currently FAILS because the DELETE endpoint uses location_id in the URL (not ol_id)
    and the RPC removes ALL rows for (option_id, location_id).
    """
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    ol_id_first = str(uuid4())
    ol_id_second = str(uuid4())
    # Seed two rows with the same location_id but distinct surrogate ids
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_first,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_second,
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 1,
            "time_period": "afternoon",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Delete only the first occurrence by its surrogate ol_id
        r = client.delete(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id_first}",
        )
        assert r.status_code == 204, f"delete by ol_id failed: {r.status_code} {r.text}"

        # The second row must still be present
        r_list = client.get(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        )
        assert r_list.status_code == 200
        remaining = r_list.json()
        assert len(remaining) == 1, f"expected 1 remaining row, got {len(remaining)}"
        assert remaining[0]["location_id"] == location_id
        assert remaining[0]["id"] == ol_id_second
    finally:
        app.dependency_overrides.clear()


def test_reorder_with_duplicate_locations(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reorder endpoint must accept ol_ids (not location_ids) so that duplicate
    location rows can be addressed independently.
    Given: loc_A at sort_order 0, loc_B at sort_order 1, loc_A at sort_order 2
    Reorder to [ol_A2, ol_B, ol_A0] and verify the new sort_orders are 0, 1, 2.
    Currently FAILS because the reorder endpoint accepts location_ids (not ol_ids)
    and rejects the duplicate.
    """
    trip_id, day_id, option_id, loc_a_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    loc_b_id = str(uuid4())
    mock_sb._locations_store.append({"location_id": loc_b_id, "trip_id": trip_id, "name": "LocB"})

    ol_id_a0 = str(uuid4())
    ol_id_b = str(uuid4())
    ol_id_a2 = str(uuid4())

    mock_sb._option_locations_store.append(
        {
            "id": ol_id_a0,
            "option_id": option_id,
            "location_id": loc_a_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_b,
            "option_id": option_id,
            "location_id": loc_b_id,
            "sort_order": 1,
            "time_period": "afternoon",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_a2,
            "option_id": option_id,
            "location_id": loc_a_id,
            "sort_order": 2,
            "time_period": "evening",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Reorder using ol_ids: put ol_id_a2 first, then ol_id_b, then ol_id_a0
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
            json={"ol_ids": [ol_id_a2, ol_id_b, ol_id_a0]},
        )
        assert r.status_code == 200, f"reorder by ol_ids failed: {r.status_code} {r.text}"
        data = r.json()
        assert len(data) == 3
        # First item must be the ol_id_a2 row at sort_order 0
        assert data[0]["id"] == ol_id_a2
        assert data[0]["sort_order"] == 0
        # Second must be ol_id_b at sort_order 1
        assert data[1]["id"] == ol_id_b
        assert data[1]["sort_order"] == 1
        # Third must be ol_id_a0 at sort_order 2
        assert data[2]["id"] == ol_id_a0
        assert data[2]["sort_order"] == 2
    finally:
        app.dependency_overrides.clear()


def test_itinerary_tree_returns_ol_id(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """The itinerary tree response must include an `id` (ol_id) on every
    ItineraryOptionLocation node so the frontend can address individual rows.
    Currently FAILS because ItineraryOptionLocation has no `id` field and the
    get_itinerary_tree RPC mock does not emit ol_id.
    """
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())
    loc_a_id = str(uuid4())
    loc_b_id = str(uuid4())
    ol_id_a = str(uuid4())
    ol_id_b = str(uuid4())

    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Itinerary ol_id test trip",
            "start_date": None,
            "end_date": None,
        }
    )
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": "2025-07-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._locations_store.append({"location_id": loc_a_id, "trip_id": trip_id, "name": "A"})
    mock_sb._locations_store.append({"location_id": loc_b_id, "trip_id": trip_id, "name": "B"})
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_a,
            "option_id": option_id,
            "location_id": loc_a_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "id": ol_id_b,
            "option_id": option_id,
            "location_id": loc_b_id,
            "sort_order": 1,
            "time_period": "afternoon",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200, f"itinerary fetch failed: {r.status_code} {r.text}"
        body = r.json()
        days = body.get("days", [])
        assert len(days) == 1
        options = days[0].get("options", [])
        assert len(options) == 1
        locations = options[0].get("locations", [])
        assert len(locations) == 2, f"expected 2 locations, got {len(locations)}"
        for loc_entry in locations:
            assert "id" in loc_entry, (
                "ItineraryOptionLocation must expose `id` (ol_id), "
                f"got keys: {list(loc_entry.keys())}"
            )
        # Verify the ids match what was seeded
        returned_ids = {loc_entry["id"] for loc_entry in locations}
        assert ol_id_a in returned_ids
        assert ol_id_b in returned_ids
    finally:
        app.dependency_overrides.clear()
