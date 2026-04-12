"""Pydantic schema validation tests for location bodies."""

from backend.app.models.schemas import AddLocationBody


class TestAddLocationBodyValidation:
    """Basic validation tests for AddLocationBody."""

    def test_name_required(self):
        """Name is required and must be non-empty."""
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            AddLocationBody(name="")

    def test_minimal_body(self):
        """Only name is required."""
        body = AddLocationBody(name="Test Location")
        assert body.name == "Test Location"
        assert body.latitude is None
        assert body.longitude is None
        assert body.photo_resource_name is None

    def test_with_coords_and_photo(self):
        """lat/lng and photo_resource_name are accepted."""
        body = AddLocationBody(
            name="Louvre Museum",
            latitude=48.8606,
            longitude=2.3376,
            photo_resource_name="places/ChIJCzYy5IS16lQR/photos/AXCi2Q6abc123",
        )
        assert body.latitude == 48.8606
        assert body.longitude == 2.3376
        assert body.photo_resource_name == "places/ChIJCzYy5IS16lQR/photos/AXCi2Q6abc123"
