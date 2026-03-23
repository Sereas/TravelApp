"""Tests for location photo upload/delete endpoints."""

from io import BytesIO
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app

TEST_USER_ID = "11111111-2222-3333-4444-555555555555"
TRIP_ID = str(uuid4())
LOCATION_ID = str(uuid4())


def _make_mock_supabase(*, has_location=True, user_image_url=None):
    """Build a mock supabase with storage support."""
    mock = MagicMock()

    # verify_resource_chain RPC
    def rpc_handler(name, params):
        if name == "verify_resource_chain":
            result = MagicMock()
            result.execute.return_value = MagicMock(data=True)
            return result
        result = MagicMock()
        result.execute.return_value = MagicMock(data=[])
        return result

    mock.rpc = rpc_handler

    # Table routing
    location_row = {
        "location_id": LOCATION_ID,
        "trip_id": TRIP_ID,
        "name": "Test Location",
        "address": "123 Street",
        "google_link": None,
        "google_place_id": None,
        "google_source_type": None,
        "added_by_email": "test@example.com",
        "note": None,
        "added_by_user_id": TEST_USER_ID,
        "city": "Paris",
        "working_hours": None,
        "requires_booking": None,
        "category": "Museum",
        "latitude": None,
        "longitude": None,
        "user_image_url": user_image_url,
    }

    def table_handler(name):
        table_mock = MagicMock()
        if name == "locations":
            select_chain = MagicMock()
            select_chain.eq.return_value = select_chain
            if has_location:
                select_chain.execute.return_value = MagicMock(data=[location_row])
            else:
                select_chain.execute.return_value = MagicMock(data=[])
            table_mock.select.return_value = select_chain

            update_chain = MagicMock()
            update_chain.eq.return_value = update_chain
            update_chain.execute.return_value = MagicMock(data=[location_row])
            table_mock.update.return_value = update_chain
        elif name == "place_photos":
            select_chain = MagicMock()
            select_chain.eq.return_value = select_chain
            select_chain.in_.return_value = select_chain
            select_chain.execute.return_value = MagicMock(data=[])
            table_mock.select.return_value = select_chain
        return table_mock

    mock.table = table_handler

    # Storage mock
    bucket_mock = MagicMock()
    bucket_mock.get_public_url.return_value = "https://storage.example.com/user-photos/test.jpg"
    mock.storage.from_.return_value = bucket_mock

    return mock


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_override():
    async def override():
        return UUID(TEST_USER_ID)

    app.dependency_overrides[get_current_user_id] = override
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


def _make_test_image(content_type="image/jpeg", size=1024):
    """Create a small test image file."""
    return BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * (size - 4))


class TestUploadPhoto:
    def test_upload_succeeds(self, client, auth_override):
        mock_sb = _make_mock_supabase()
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.jpg", _make_test_image(), "image/jpeg")},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == LOCATION_ID
            assert data["user_image_url"] == "https://storage.example.com/user-photos/test.jpg"
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_rejects_invalid_type(self, client, auth_override):
        mock_sb = _make_mock_supabase()
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("doc.pdf", BytesIO(b"fake pdf"), "application/pdf")},
            )
            assert resp.status_code == 422
            assert "Invalid image type" in resp.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_rejects_oversized_file(self, client, auth_override):
        mock_sb = _make_mock_supabase()
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            big_file = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * (6 * 1024 * 1024))
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("big.jpg", big_file, "image/jpeg")},
            )
            assert resp.status_code == 422
            assert "too large" in resp.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_404_wrong_trip(self, client, auth_override):
        mock_sb = _make_mock_supabase(has_location=False)
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.jpg", _make_test_image(), "image/jpeg")},
            )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)


class TestDeletePhoto:
    def test_delete_clears_user_image(self, client, auth_override):
        mock_sb = _make_mock_supabase(
            user_image_url="https://storage.example.com/user-photos/old.jpg"
        )
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.delete(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
            )
            assert resp.status_code == 204
            # Verify storage.remove was called
            bucket = mock_sb.storage.from_.return_value
            assert bucket.remove.called
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_delete_404_no_override(self, client, auth_override):
        mock_sb = _make_mock_supabase(user_image_url=None)
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.delete(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
            )
            assert resp.status_code == 404
            assert "No user photo" in resp.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_delete_404_location_not_found(self, client, auth_override):
        mock_sb = _make_mock_supabase(has_location=False)
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        try:
            resp = client.delete(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
            )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)
