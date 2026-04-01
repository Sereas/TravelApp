"""
MED-02: google_raw size cap on AddLocationBody.

RED phase — these tests FAIL against current code because AddLocationBody
accepts ``google_raw: dict | None`` with no size constraint, allowing
arbitrarily large payloads through Pydantic validation.
"""

import json

import pytest
from pydantic import ValidationError

from backend.app.models.schemas import AddLocationBody

# 50 KB threshold the validator should enforce
_MAX_GOOGLE_RAW_BYTES = 50_000


def _make_google_raw_over_limit() -> dict:
    """Build a dict whose JSON serialization exceeds 50 KB."""
    # Each entry is ~60 bytes; 1000 entries ≈ 60 KB
    return {f"key_{i}": "x" * 50 for i in range(1000)}


def _make_google_raw_at_limit() -> dict:
    """Build a dict whose JSON serialization is just under 50 KB."""
    # Use a single key with a large value string to stay under the limit.
    # "{"value": "<n chars>"}" where n = 49_980 gives ~50 000 bytes safely under.
    return {"value": "x" * 49_960}


class TestGoogleRawSizeCap:
    """
    AddLocationBody.google_raw must reject payloads that exceed 50 KB when
    serialized to JSON.
    """

    def test_google_raw_over_50kb_raises_validation_error(self):
        """
        MED-02 — RED.

        Passing a ``google_raw`` dict that serializes to >50 KB must raise
        ``ValidationError``.

        Currently FAILS because no size validator is defined on ``google_raw``
        in ``AddLocationBody``.
        """
        large_raw = _make_google_raw_over_limit()
        serialized_size = len(json.dumps(large_raw).encode())
        assert serialized_size > _MAX_GOOGLE_RAW_BYTES, (
            f"Test setup error: expected >50 KB payload, got {serialized_size} bytes"
        )

        with pytest.raises(ValidationError) as exc_info:
            AddLocationBody(name="Test Location", google_raw=large_raw)

        errors = exc_info.value.errors()
        assert any("google_raw" in str(e.get("loc", "")) for e in errors), (
            f"ValidationError was raised but did not mention google_raw. Errors: {errors}"
        )

    def test_google_raw_under_50kb_is_accepted(self):
        """
        A ``google_raw`` dict that serializes to <50 KB must pass validation.

        This must still pass (not a false positive) once the validator is added.
        """
        small_raw = _make_google_raw_at_limit()
        serialized_size = len(json.dumps(small_raw).encode())
        assert serialized_size < _MAX_GOOGLE_RAW_BYTES, (
            f"Test setup error: expected <50 KB payload, got {serialized_size} bytes"
        )

        # Must NOT raise
        body = AddLocationBody(name="Test Location", google_raw=small_raw)
        assert body.google_raw == small_raw

    def test_google_raw_none_is_accepted(self):
        """``google_raw=None`` must always be accepted."""
        body = AddLocationBody(name="Test Location", google_raw=None)
        assert body.google_raw is None

    def test_google_raw_small_dict_is_accepted(self):
        """A normal-sized google_raw dict (typical Places API response) is fine."""
        normal_raw = {
            "place_id": "ChIJ2eUgeAK6j4ARbn5u_wAGqWA",
            "name": "Test Place",
            "formatted_address": "123 Test St, City, Country",
            "geometry": {"location": {"lat": 48.8584, "lng": 2.2945}},
        }
        body = AddLocationBody(name="Test Location", google_raw=normal_raw)
        assert body.google_raw == normal_raw

    def test_google_raw_exactly_at_limit_is_rejected(self):
        """
        A dict whose JSON is exactly at the byte boundary should be rejected
        (the limit is exclusive: >50 KB is invalid, >=50 KB is invalid).

        This test defines the boundary condition: serialized size >= 50_000 bytes
        must fail validation.
        """
        # Build a dict that is exactly 50_000 bytes when serialized
        # Use a large string value to hit exactly the boundary
        padding_needed = _MAX_GOOGLE_RAW_BYTES - len(json.dumps({"k": ""}).encode())
        boundary_raw = {"k": "x" * padding_needed}
        serialized_size = len(json.dumps(boundary_raw).encode())
        assert serialized_size >= _MAX_GOOGLE_RAW_BYTES, (
            f"Test setup error: expected >={_MAX_GOOGLE_RAW_BYTES} bytes, got {serialized_size}"
        )

        with pytest.raises(ValidationError):
            AddLocationBody(name="Test Location", google_raw=boundary_raw)
