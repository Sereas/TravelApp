"""Request/response schemas for trips and locations APIs (including itinerary)."""

from datetime import date as date_type
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class CreateTripBody(BaseModel):
    """Request body for POST create-trip."""

    name: str = Field(..., min_length=1, description="Trip display name (required)")
    start_date: date_type | None = None
    end_date: date_type | None = None


class TripResponse(BaseModel):
    """Response body for create-trip (201)."""

    id: str = Field(..., description="Trip UUID")
    name: str = Field(..., description="Trip display name")
    start_date: date_type | None = None
    end_date: date_type | None = None


REQUIRES_BOOKING_VALUES = frozenset({"no", "yes", "yes_done"})
CATEGORY_VALUES = frozenset(
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

_NULLABLE_TEXT_FIELDS = (
    "address",
    "google_link",
    "note",
    "city",
    "working_hours",
    "google_place_id",
    "google_source_type",
)

# Max lengths aligned with DB / audit (city varchar(255); others reasonable limits)
_LOCATION_NAME_MAX = 500
_LOCATION_ADDRESS_MAX = 1000
_LOCATION_GOOGLE_LINK_MAX = 2048
_LOCATION_NOTE_MAX = 2000
_LOCATION_CITY_MAX = 255
_LOCATION_WORKING_HOURS_MAX = 500


class _LocationFieldsMixin(BaseModel):
    """Shared validators for location write schemas."""

    @model_validator(mode="before")
    @classmethod
    def empty_strings_to_none(cls, data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for key in _NULLABLE_TEXT_FIELDS:
            if key in out and out[key] == "":
                out[key] = None
        return out

    @field_validator("requires_booking", check_fields=False)
    @classmethod
    def validate_requires_booking(cls, v):
        if v is not None and v not in REQUIRES_BOOKING_VALUES:
            raise ValueError("must be one of: no, yes, yes_done")
        return v

    @field_validator("category", check_fields=False)
    @classmethod
    def validate_category(cls, v):
        if v is not None and v not in CATEGORY_VALUES:
            raise ValueError(f"must be one of: {sorted(CATEGORY_VALUES)}")
        return v


class AddLocationBody(_LocationFieldsMixin):
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
    google_place_id: str | None = None
    google_source_type: str | None = None
    google_raw: dict | None = None


class LocationResponse(BaseModel):
    """Response body for add-location (201)."""

    id: str = Field(..., description="Location UUID")
    name: str = Field(..., description="Location name")
    address: str | None = None
    google_link: str | None = None
    google_place_id: str | None = None
    google_source_type: str | None = None
    google_raw: dict | None = None
    note: str | None = None
    added_by_user_id: str | None = None
    added_by_email: str | None = None
    city: str | None = None
    working_hours: str | None = None
    requires_booking: str | None = None
    category: str | None = None
    latitude: float | None = None
    longitude: float | None = None


# Batch add: same shape as AddLocationBody per item
BatchAddLocationItem = AddLocationBody


class UpdateTripBody(BaseModel):
    """Request body for PATCH update-trip."""

    name: str | None = Field(None, min_length=1, description="New trip display name")
    start_date: date_type | None = None
    end_date: date_type | None = None


class UpdateLocationBody(_LocationFieldsMixin):
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
    google_place_id: str | None = None
    google_source_type: str | None = None
    google_raw: dict | None = None


# -------- Itinerary schemas (trip_days, day_options, option_locations) --------


class CreateDayBody(BaseModel):
    """Request body for POST create-day.

    Backend assigns sort_order; client does not send it.
    """

    date: date_type | None = None


class UpdateDayBody(BaseModel):
    """Request body for PATCH update-day."""

    date: date_type | None = None
    sort_order: int | None = Field(
        None,
        ge=0,
        description="Optional for single-item move; reorder endpoint preferred.",
    )


class DayResponse(BaseModel):
    """Response body for trip day operations."""

    id: str = Field(..., description="Day UUID")
    trip_id: str = Field(..., description="Parent trip UUID")
    date: date_type | None = None
    sort_order: int = Field(..., ge=0)
    created_at: datetime | None = None


class ReorderDaysBody(BaseModel):
    """Request body for PATCH reorder-days."""

    day_ids: list[str] = Field(..., min_length=1, description="Ordered list of day UUIDs")


class CreateOptionBody(BaseModel):
    """Request body for POST create-option.

    Backend assigns option_index. Cities and created_by are optional.
    """

    starting_city: str | None = Field(None, max_length=255)
    ending_city: str | None = Field(None, max_length=255)
    created_by: str | None = Field(
        None,
        max_length=255,
        description="Free-text creator label; not derived from JWT.",
    )


class UpdateOptionBody(BaseModel):
    """Request body for PATCH update-option."""

    option_index: int | None = Field(
        None,
        ge=1,
        description="New index within the day; 1 = main option.",
    )
    starting_city: str | None = Field(None, max_length=255)
    ending_city: str | None = Field(None, max_length=255)
    created_by: str | None = Field(None, max_length=255)


class OptionResponse(BaseModel):
    """Response body for day option operations."""

    id: str = Field(..., description="Option UUID")
    day_id: str = Field(..., description="Parent day UUID")
    option_index: int = Field(..., ge=1)
    starting_city: str | None = None
    ending_city: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None


class ReorderOptionsBody(BaseModel):
    """Request body for PATCH reorder options."""

    option_ids: list[str] = Field(..., min_length=1, description="Ordered list of option UUIDs")


class AddOptionLocationBody(BaseModel):
    """Request body for POST add option-location (single)."""

    location_id: str = Field(..., description="Location UUID to attach to this option")
    sort_order: int = Field(..., ge=0, description="Order within the option")
    time_period: str = Field(
        ...,
        description="One of: morning, afternoon, evening, night.",
    )

    @field_validator("time_period")
    @classmethod
    def validate_time_period(cls, v: str) -> str:
        allowed = {"morning", "afternoon", "evening", "night"}
        if v not in allowed:
            raise ValueError(f"time_period must be one of: {sorted(allowed)}")
        return v


class UpdateOptionLocationBody(BaseModel):
    """Request body for PATCH update option-location link."""

    sort_order: int | None = Field(None, ge=0)
    time_period: str | None = None

    @field_validator("time_period")
    @classmethod
    def validate_time_period_optional(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"morning", "afternoon", "evening", "night"}
        if v not in allowed:
            raise ValueError(f"time_period must be one of: {sorted(allowed)}")
        return v


class ReorderOptionLocationsBody(BaseModel):
    """Request body for PATCH reorder option-locations."""

    location_ids: list[str] = Field(
        ..., min_length=1, description="Ordered list of location UUIDs in this option"
    )


class LocationSummary(BaseModel):
    """Minimal embedded location info used in itinerary views."""

    id: str = Field(..., description="Location UUID")
    name: str = Field(..., description="Location name")
    city: str | None = None
    address: str | None = None
    google_link: str | None = None
    category: str | None = None
    note: str | None = None
    working_hours: str | None = None
    requires_booking: str | None = None


class OptionLocationResponse(BaseModel):
    """Response body for option-locations operations."""

    option_id: str = Field(..., description="Option UUID")
    location_id: str = Field(..., description="Location UUID")
    sort_order: int = Field(..., ge=0)
    time_period: str = Field(..., description="morning | afternoon | evening | night")
    location: LocationSummary | None = None


class ItineraryOptionLocation(BaseModel):
    """Itinerary tree node: location entry inside an option."""

    location_id: str
    sort_order: int
    time_period: str
    location: LocationSummary


class RouteSegmentSummary(BaseModel):
    """Per-segment metrics in itinerary tree (one per leg between consecutive stops)."""

    segment_order: int = Field(..., ge=0, description="0-based index: leg from stop[i] to stop[i+1]")
    duration_seconds: int | None = None
    distance_meters: int | None = None


class ItineraryRoute(BaseModel):
    """Itinerary tree node: route within an option."""

    route_id: str
    label: str | None = None
    transport_mode: str = "walk"
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = 0
    location_ids: list[str] = Field(default_factory=list)
    route_status: str = Field(
        "pending",
        description="pending | ok | error; enables UI to show loading/error state",
    )
    segments: list[RouteSegmentSummary] = Field(
        default_factory=list,
        description="Per-leg metrics in order; segment_order i = leg from stop i to stop i+1",
    )


class ItineraryOption(BaseModel):
    """Itinerary tree node: option containing locations."""

    id: str
    option_index: int
    starting_city: str | None = None
    ending_city: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    locations: list[ItineraryOptionLocation] = Field(default_factory=list)
    routes: list[ItineraryRoute] = Field(default_factory=list)


class ItineraryDay(BaseModel):
    """Itinerary tree node: day containing options."""

    id: str
    date: date_type | None = None
    sort_order: int
    created_at: datetime | None = None
    options: list[ItineraryOption] = Field(default_factory=list)


class ItineraryResponse(BaseModel):
    """Full itinerary for a trip: list of days with nested options and locations."""

    days: list[ItineraryDay] = Field(default_factory=list)


class LocationPreviewResponse(BaseModel):
    """Response body for Google-based location preview (no DB write)."""

    name: str
    address: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    google_place_id: str
    suggested_category: str | None = None
    working_hours: list[str] = Field(default_factory=list)
    website: str | None = None
    phone: str | None = None
    google_raw: dict


# -------- Route schemas (option_routes, route_stops) --------

TRANSPORT_MODE_VALUES = frozenset({"walk", "drive", "transit"})


class CreateRouteBody(BaseModel):
    """Request body for POST create-route."""

    transport_mode: str = Field(..., description="One of: walk, drive, transit")
    label: str | None = None
    location_ids: list[str] = Field(..., min_length=2, description="Ordered stop location UUIDs")

    @field_validator("transport_mode")
    @classmethod
    def validate_transport_mode(cls, v: str) -> str:
        if v not in TRANSPORT_MODE_VALUES:
            raise ValueError("must be one of: walk, drive, transit")
        return v


ROUTE_STATUS_VALUES = frozenset({"pending", "ok", "error"})


class RouteResponse(BaseModel):
    """Response body for route operations."""

    route_id: str = Field(..., description="Route UUID")
    option_id: str = Field(..., description="Parent option UUID")
    label: str | None = None
    transport_mode: str = Field(..., description="walk | drive | transit")
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = Field(..., ge=0)
    location_ids: list[str] = Field(default_factory=list)
    route_status: str = Field(
        "pending",
        description="pending = metrics not yet calculated; ok = all segments success; error = one or more segments failed",
    )


# -------- Route segment schemas (recalculate, get with segments) --------


class RecalculateRouteBody(BaseModel):
    """Optional body for POST recalculate/refresh route."""

    transport_mode: str | None = Field(None, description="walk | drive | transit; uses route's mode if omitted")
    force_refresh: bool = Field(False, description="If true, recompute all segments ignoring cache/cooldown")

    @field_validator("transport_mode")
    @classmethod
    def validate_transport_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in TRANSPORT_MODE_VALUES:
            raise ValueError("must be one of: walk, drive, transit")
        return v


class RouteSegmentResponse(BaseModel):
    """One segment (leg) of a route: from_location -> to_location; includes retry metadata when not success."""

    segment_order: int = Field(..., ge=0)
    from_location_id: str = Field(..., description="Location UUID (origin of this leg)")
    to_location_id: str = Field(..., description="Location UUID (destination of this leg)")
    distance_meters: int | None = None
    duration_seconds: int | None = None
    encoded_polyline: str | None = Field(None, description="Google encoded polyline for MapLibre")
    status: str = Field("success", description="success | retryable_error | config_error | input_error | no_route")
    error_type: str | None = Field(None, description="e.g. forbidden_or_unauthorized, server_or_rate_limit")
    error_message: str | None = None
    provider_http_status: int | None = Field(None, description="e.g. 403, 500")
    next_retry_at: str | None = Field(None, description="ISO8601; next time retry is eligible on view")


class RouteWithSegmentsResponse(BaseModel):
    """Route plus per-segment data and geometry (for recalculate and get-with-segments)."""

    route_id: str = Field(..., description="Route UUID")
    option_id: str = Field(..., description="Parent option UUID")
    label: str | None = None
    transport_mode: str = Field(..., description="walk | drive | transit")
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = Field(..., ge=0)
    location_ids: list[str] = Field(default_factory=list)
    segments: list[RouteSegmentResponse] = Field(default_factory=list)
    route_status: str = Field(
        "ok",
        description="ok = all segments success; error = one or more segments failed (partial or total)",
    )
