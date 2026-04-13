"""Tests for add-location endpoint (Slice 3)."""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_add_location_missing_name_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Missing name -> 422."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={},
            headers={},
        )
        assert r.status_code == 422
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": ""},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_add_location_valid_body_own_trip_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Valid JWT + own trip + valid body -> 201, body has location id and fields."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={
                "name": "Eiffel Tower",
                "address": "Champ de Mars, Paris",
                "google_link": "https://maps.google.com/...",
                "note": "Morning visit",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["name"] == "Eiffel Tower"
        assert data["address"] == "Champ de Mars, Paris"
        assert data["google_link"] == "https://maps.google.com/..."
        assert data["note"] == "Morning visit"
        assert len(locations_inserted) == 1
        assert locations_inserted[0]["trip_id"] == trip_id
        assert locations_inserted[0]["name"] == "Eiffel Tower"
    finally:
        app.dependency_overrides.clear()


def test_add_location_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Non-existent trip_id -> 404."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    # No trip in mock -> 404
    mock_sb = MockSupabase({}, mock_user_id)

    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Some Place"},
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_add_location_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Other user's trip_id -> 404."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    # Trip owned by owner_id; we authenticate as other_user_id
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Some Place"},
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()


def test_add_location_then_verify_in_db(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Add location via API, then read from (mock) DB -> location exists
    with correct trip_id and name."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Louvre", "note": "Book in advance"},
        )
        assert r.status_code == 201
        assert len(locations_inserted) == 1
        loc = locations_inserted[0]
        assert loc["trip_id"] == trip_id
        assert loc["name"] == "Louvre"
        assert loc["note"] == "Book in advance"
    finally:
        app.dependency_overrides.clear()


def test_add_location_no_jwt_returns_401(client: TestClient, monkeypatch):
    """No Authorization header on POST add location -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    r = client.post(
        "/api/v1/trips/00000000-0000-0000-0000-000000000001/locations",
        json={"name": "Some Place"},
    )
    assert r.status_code == 401


def test_add_location_duplicate_google_place_id_returns_409(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Adding a location with same google_place_id in the same trip -> 409."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r1 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Louvre", "google_place_id": "ChIJ123"},
        )
        assert r1.status_code == 201
        assert len(locations_inserted) == 1

        r2 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Louvre Museum", "google_place_id": "ChIJ123"},
        )
        assert r2.status_code == 409
        assert "already exists" in r2.json()["detail"]
        assert len(locations_inserted) == 1  # no second insert
    finally:
        app.dependency_overrides.clear()


def test_add_location_same_google_place_id_different_trip_allowed(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Same google_place_id in different trips -> allowed."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id_1 = str(uuid4())
    trip_id_2 = str(uuid4())
    mock_sb = MockSupabase(
        {trip_id_1: str(mock_user_id), trip_id_2: str(mock_user_id)}, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r1 = client.post(
            f"/api/v1/trips/{trip_id_1}/locations",
            json={"name": "Louvre", "google_place_id": "ChIJ123"},
        )
        assert r1.status_code == 201

        r2 = client.post(
            f"/api/v1/trips/{trip_id_2}/locations",
            json={"name": "Louvre", "google_place_id": "ChIJ123"},
        )
        assert r2.status_code == 201
        assert len(locations_inserted) == 2
    finally:
        app.dependency_overrides.clear()


def test_add_location_no_google_place_id_skips_dedup(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Locations without google_place_id should skip dedup check."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r1 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Cafe"},
        )
        r2 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Cafe"},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert len(locations_inserted) == 2
    finally:
        app.dependency_overrides.clear()


def test_add_location_duplicate_names_allowed(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Duplicate location names for same trip are allowed."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r1 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Cafe"},
        )
        r2 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Cafe"},
        )
        assert r1.status_code == 201 and r2.status_code == 201
        assert len(locations_inserted) == 2
        assert locations_inserted[0]["name"] == locations_inserted[1]["name"] == "Cafe"
        assert r1.json()["id"] != r2.json()["id"]
    finally:
        app.dependency_overrides.clear()


# ---- Batch add locations ----


def test_batch_add_empty_array_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Empty array -> 422."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/locations/batch", json=[])
        assert r.status_code == 422
        detail = r.json().get("detail", "")
        if isinstance(detail, str):
            assert "at least one" in detail.lower() or "location" in detail.lower()
    finally:
        app.dependency_overrides.clear()


def test_batch_add_single_item_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Single item in array -> 201 and one location."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[{"name": "Louvre", "note": "Book ahead"}],
        )
        assert r.status_code == 201
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "Louvre"
        assert data[0]["note"] == "Book ahead"
        assert "id" in data[0]
        assert len(locations_inserted) == 1
    finally:
        app.dependency_overrides.clear()


def test_batch_add_multiple_items_returns_201_and_same_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Multiple items -> 201 and same count/order."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[
                {"name": "Eiffel Tower", "address": "Paris"},
                {"name": "Louvre", "note": "Morning"},
                {"name": "Notre-Dame"},
            ],
        )
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 3
        assert data[0]["name"] == "Eiffel Tower"
        assert data[0]["address"] == "Paris"
        assert data[1]["name"] == "Louvre"
        assert data[1]["note"] == "Morning"
        assert data[2]["name"] == "Notre-Dame"
        assert len(locations_inserted) == 3
        names = [loc["name"] for loc in locations_inserted]
        assert names == ["Eiffel Tower", "Louvre", "Notre-Dame"]
    finally:
        app.dependency_overrides.clear()


def test_batch_add_item_missing_name_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Any item missing name -> 422."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[{"name": "Valid"}, {"address": "No name"}],
        )
        assert r.status_code == 422
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()


def test_batch_add_non_array_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Non-array body -> 422."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json={"name": "Single object"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_batch_add_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Non-existent trip_id -> 404."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[{"name": "Place"}],
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()


def test_batch_add_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Other user's trip_id -> 404."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[{"name": "Place"}],
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()


def test_batch_add_no_jwt_returns_401(client: TestClient, monkeypatch):
    """No Authorization header -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    r = client.post(
        "/api/v1/trips/00000000-0000-0000-0000-000000000001/locations/batch",
        json=[{"name": "Place"}],
    )
    assert r.status_code == 401


# ---- List locations (Slice 4) ----


def test_list_locations_own_trip_with_locations_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Own trip with locations -> 200, array with all stored fields."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Eiffel Tower", "address": "Paris", "note": "Visit"},
        )
        client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Louvre", "google_link": "https://maps.google.com/"},
        )
        r = client.get(f"/api/v1/trips/{trip_id}/locations")
        assert r.status_code == 200
        assert "X-Locations-Ownership-Ms" in r.headers
        assert "X-Locations-Query-Ms" in r.headers
        assert "X-Locations-Photo-Ms" in r.headers
        assert r.headers["X-Locations-Rows"] == "2"
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 2
        names = {loc["name"] for loc in data}
        assert names == {"Eiffel Tower", "Louvre"}
        one = next(loc for loc in data if loc["name"] == "Eiffel Tower")
        assert one["address"] == "Paris"
        assert one["note"] == "Visit"
        other = next(loc for loc in data if loc["name"] == "Louvre")
        assert other["google_link"] == "https://maps.google.com/"
    finally:
        app.dependency_overrides.clear()


def test_list_locations_own_trip_zero_locations_returns_200_empty(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Own trip with zero locations -> 200, []."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/locations")
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_list_locations_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Non-existent trip_id -> 404."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/locations",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_list_locations_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Other user's trip_id -> 404."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/locations",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_add_location_with_useful_link_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """useful_link is accepted and returned on create."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={
                "name": "Restaurant",
                "useful_link": "https://example.com/menu",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["useful_link"] == "https://example.com/menu"
        assert len(locations_inserted) == 1
        assert locations_inserted[0]["useful_link"] == "https://example.com/menu"
    finally:
        app.dependency_overrides.clear()


def test_add_location_invalid_useful_link_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """useful_link must be an http/https URL."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={
                "name": "Bad Link",
                "useful_link": "ftp://not-http.com",
            },
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_list_locations_no_jwt_returns_401(client: TestClient, monkeypatch):
    """No Authorization header -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    r = client.get("/api/v1/trips/00000000-0000-0000-0000-000000000001/locations")
    assert r.status_code == 401
