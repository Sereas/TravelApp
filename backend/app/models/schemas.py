"""Request/response schemas for trips API."""

from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


class CreateTripBody(BaseModel):
    """Request body for POST create-trip."""

    name: str = Field(..., min_length=1, description="Trip display name (required)")
    start_date: date | None = None
    end_date: date | None = None


class TripResponse(BaseModel):
    """Response body for create-trip (201)."""

    id: str = Field(..., description="Trip UUID")
    name: str = Field(..., description="Trip display name")
    start_date: date | None = None
    end_date: date | None = None


_REQUIRES_BOOKING_VALUES = frozenset({"no", "yes", "yes_done"})
_CATEGORY_VALUES = frozenset(
    {
        "Museum",
        "Restaurant",
        "Café",
        "Bar",
        "Walking around",
        "Excursion",
        "Accommodation",
        "Transport",
        "Shopping",
        "Park / nature",
        "Beach",
        "Viewpoint",
        "Event",
        "Other",
    }
)


# Max lengths aligned with DB / audit (city varchar(255); others reasonable limits)
_LOCATION_NAME_MAX = 500
_LOCATION_ADDRESS_MAX = 1000
_LOCATION_GOOGLE_LINK_MAX = 2048
_LOCATION_NOTE_MAX = 2000
_LOCATION_CITY_MAX = 255
_LOCATION_WORKING_HOURS_MAX = 500


class AddLocationBody(BaseModel):
    """Request body for POST add-location."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=_LOCATION_NAME_MAX,
        description="Location name (required)",
    )
    address: str | None = Field(None, max_length=_LOCATION_ADDRESS_MAX)
    google_link: str | None = Field(None, max_length=_LOCATION_GOOGLE_LINK_MAX)
    note: str | None = Field(None, max_length=_LOCATION_NOTE_MAX)
    city: str | None = Field(None, max_length=_LOCATION_CITY_MAX)
    working_hours: str | None = Field(None, max_length=_LOCATION_WORKING_HOURS_MAX)
    requires_booking: str | None = Field(
        None,
        description="One of: no, yes, yes_done",
    )
    category: str | None = None

    @model_validator(mode="before")
    @classmethod
    def empty_strings_to_none(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for key in ("address", "google_link", "note", "city", "working_hours"):
            if key in out and out[key] == "":
                out[key] = None
        return out

    @field_validator("requires_booking")
    @classmethod
    def validate_requires_booking(cls, v):
        if v is not None and v not in _REQUIRES_BOOKING_VALUES:
            raise ValueError("must be one of: no, yes, yes_done")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v is not None and v not in _CATEGORY_VALUES:
            raise ValueError(f"must be one of: {sorted(_CATEGORY_VALUES)}")
        return v


class LocationResponse(BaseModel):
    """Response body for add-location (201)."""

    id: str = Field(..., description="Location UUID")
    name: str = Field(..., description="Location name")
    address: str | None = None
    google_link: str | None = None
    note: str | None = None
    added_by_user_id: str | None = None
    added_by_email: str | None = None
    city: str | None = None
    working_hours: str | None = None
    requires_booking: str | None = None
    category: str | None = None


# Batch add: same shape as AddLocationBody per item
BatchAddLocationItem = AddLocationBody


class UpdateTripBody(BaseModel):
    """Request body for PATCH update-trip."""

    name: str | None = Field(None, min_length=1, description="New trip display name")
    start_date: date | None = None
    end_date: date | None = None


class UpdateLocationBody(BaseModel):
    """Request body for PATCH update-location."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=_LOCATION_NAME_MAX,
        description="New location name",
    )
    address: str | None = Field(None, max_length=_LOCATION_ADDRESS_MAX)
    google_link: str | None = Field(None, max_length=_LOCATION_GOOGLE_LINK_MAX)
    note: str | None = Field(None, max_length=_LOCATION_NOTE_MAX)
    city: str | None = Field(None, max_length=_LOCATION_CITY_MAX)
    working_hours: str | None = Field(None, max_length=_LOCATION_WORKING_HOURS_MAX)
    requires_booking: str | None = None
    category: str | None = None

    @model_validator(mode="before")
    @classmethod
    def empty_strings_to_none(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for key in ("address", "google_link", "note", "city", "working_hours"):
            if key in out and out[key] == "":
                out[key] = None
        return out

    @field_validator("requires_booking")
    @classmethod
    def validate_requires_booking(cls, v):
        if v is not None and v not in _REQUIRES_BOOKING_VALUES:
            raise ValueError("must be one of: no, yes, yes_done")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v is not None and v not in _CATEGORY_VALUES:
            raise ValueError(f"must be one of: {sorted(_CATEGORY_VALUES)}")
        return v
