"""
HIGH-02: Magic-byte validation for photo uploads.

RED phase — these tests FAIL against current code because the endpoint only
checks `file.content_type` (client-supplied header) without verifying the
actual file bytes against known magic numbers.
"""

from io import BytesIO
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app

TRIP_ID = str(uuid4())
LOCATION_ID = str(uuid4())
TEST_USER_ID = "11111111-2222-3333-4444-555555555555"


def _make_mock_supabase():
    """Minimal mock that passes ownership and location checks."""
    mock = MagicMock()

    def rpc_handler(name, params):
        result = MagicMock()
        result.execute.return_value = MagicMock(data=True)
        return result

    mock.rpc = rpc_handler

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
        "user_image_url": None,
        "user_image_crop": None,
        "useful_link": None,
        "created_at": None,
    }

    def table_handler(name):
        table_mock = MagicMock()
        chain = MagicMock()
        chain.eq.return_value = chain
        chain.execute.return_value = MagicMock(data=[location_row])
        table_mock.select.return_value = chain
        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = MagicMock(data=[location_row])
        table_mock.update.return_value = update_chain
        return table_mock

    mock.table = table_handler

    bucket_mock = MagicMock()
    bucket_mock.get_public_url.return_value = "https://storage.example.com/user-photos/test.jpg"
    mock.storage.from_.return_value = bucket_mock

    return mock


@pytest.fixture(autouse=True)
def _auth_override():
    async def override():
        return UUID(TEST_USER_ID)

    app.dependency_overrides[get_current_user_id] = override
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture
def client():
    return TestClient(app)


class TestMagicByteValidation:
    """
    Verify that the endpoint validates file magic bytes, not just content_type.

    HIGH-02 RED: test_upload_html_disguised_as_jpeg_rejected will FAIL until
    magic-byte validation is added to the endpoint.
    """

    def test_upload_html_disguised_as_jpeg_rejected(self, client):
        """
        A file claiming to be image/jpeg but containing HTML must be rejected
        with 422.  Currently FAILS — the endpoint trusts content_type without
        reading the first bytes.
        """
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            html_payload = b"<html><script>alert(1)</script></html>"
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("evil.jpg", BytesIO(html_payload), "image/jpeg")},
            )
            assert resp.status_code == 422, (
                f"Expected 422 for HTML disguised as JPEG, got {resp.status_code}. "
                "Magic-byte validation is not yet implemented."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_valid_jpeg_accepted(self, client):
        """
        A file with content_type=image/jpeg and a valid JPEG magic header
        (\\xff\\xd8\\xff) must NOT be rejected with 422.
        """
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            # JFIF JPEG header: FF D8 FF E0
            jpeg_payload = b"\xff\xd8\xff\xe0" + b"\x00" * 1020
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.jpg", BytesIO(jpeg_payload), "image/jpeg")},
            )
            assert resp.status_code != 422, (
                f"Valid JPEG should not be rejected with 422, got {resp.status_code}."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_png_magic_bytes_accepted(self, client):
        """A file with valid PNG magic bytes (\\x89PNG\\r\\n) must not be rejected."""
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            png_payload = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1016
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.png", BytesIO(png_payload), "image/png")},
            )
            assert resp.status_code != 422, (
                f"Valid PNG should not be rejected with 422, got {resp.status_code}."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_webp_magic_bytes_accepted(self, client):
        """A file with valid WebP magic bytes (RIFF....WEBP) must not be rejected."""
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            # RIFF header + WEBP marker; minimal but structurally correct signature
            webp_payload = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 1012
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.webp", BytesIO(webp_payload), "image/webp")},
            )
            assert resp.status_code != 422, (
                f"Valid WebP should not be rejected with 422, got {resp.status_code}."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_zip_disguised_as_png_rejected(self, client):
        """
        A ZIP archive (magic PK\\x03\\x04) claiming to be image/png must be
        rejected with 422.  Currently FAILS for the same reason as the HTML case.
        """
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            zip_payload = b"PK\x03\x04" + b"\x00" * 1020
            resp = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("evil.png", BytesIO(zip_payload), "image/png")},
            )
            assert resp.status_code == 422, (
                f"Expected 422 for ZIP disguised as PNG, got {resp.status_code}. "
                "Magic-byte validation is not yet implemented."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)


class TestCropDataValidation:
    """Validate the optional crop_data form field on photo upload."""

    import json

    JPEG_PAYLOAD = b"\xff\xd8\xff\xe0" + b"\x00" * 1020

    def _upload(self, client, crop_data=None):
        app.dependency_overrides[get_supabase_client] = lambda: _make_mock_supabase()
        try:
            data = {}
            if crop_data is not None:
                data["crop_data"] = crop_data
            return client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/{LOCATION_ID}/photo",
                files={"file": ("photo.jpg", BytesIO(self.JPEG_PAYLOAD), "image/jpeg")},
                data=data,
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    def test_upload_with_valid_crop_data(self, client):
        import json

        resp = self._upload(
            client,
            crop_data=json.dumps({"x": 10, "y": 5, "width": 50, "height": 31.25}),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_image_crop"] is not None
        assert body["user_image_crop"]["x"] == 10

    def test_upload_without_crop_data(self, client):
        resp = self._upload(client)
        assert resp.status_code == 200

    def test_upload_with_invalid_json(self, client):
        resp = self._upload(client, crop_data="not json")
        assert resp.status_code == 422

    def test_upload_with_missing_keys(self, client):
        import json

        resp = self._upload(client, crop_data=json.dumps({"x": 10, "y": 5}))
        assert resp.status_code == 422

    def test_upload_with_negative_value(self, client):
        import json

        crop = {"x": -10, "y": 5, "width": 50, "height": 50}
        resp = self._upload(client, crop_data=json.dumps(crop))
        assert resp.status_code == 422

    def test_upload_with_zero_width(self, client):
        import json

        crop = {"x": 0, "y": 0, "width": 0, "height": 50}
        resp = self._upload(client, crop_data=json.dumps(crop))
        assert resp.status_code == 422

    def test_cache_buster_in_url(self, client):
        resp = self._upload(client)
        assert resp.status_code == 200
        url = resp.json()["user_image_url"]
        assert "?v=" in url
