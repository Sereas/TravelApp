"""Request/response schemas for trips and locations APIs (including itinerary)."""

import re
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.app.utils.url_validation import URLValidationError, validate_google_maps_url

# Google Places photo resource names follow: places/<place_id>/photos/<photo_id>
_PHOTO_RESOURCE_RE = re.compile(r"^places/[A-Za-z0-9_\-]+/photos/[A-Za-z0-9_\-]+$")


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
        "Park",
        "Nature",
        "Beach",
        "Viewpoint",
        "Event",
        "Church",
        "City",
        "Hiking",
        "Historic site",
        "Market",
        "Nightlife",
        "Parking",
        "Spa / Wellness",
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
    "useful_link",
)

# Max lengths aligned with DB / audit (city varchar(255); others reasonable limits)
_LOCATION_NAME_MAX = 500
_LOCATION_ADDRESS_MAX = 1000
_LOCATION_GOOGLE_LINK_MAX = 2048
_LOCATION_NOTE_MAX = 2000
_LOCATION_CITY_MAX = 255
_LOCATION_WORKING_HOURS_MAX = 500
_LOCATION_USEFUL_LINK_MAX = 2048


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

    @field_validator("google_link", check_fields=False)
    @classmethod
    def validate_google_link_scheme(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not (v.lower().startswith("https://") or v.lower().startswith("http://")):
                raise ValueError("google_link must be an http/https URL")
        return v

    @field_validator("useful_link", check_fields=False)
    @classmethod
    def validate_useful_link_scheme(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not (v.lower().startswith("https://") or v.lower().startswith("http://")):
                raise ValueError("useful_link must be an http/https URL")
        return v

    @field_validator("photo_resource_name", check_fields=False)
    @classmethod
    def validate_photo_resource_name(cls, v: str | None) -> str | None:
        if v is not None and not _PHOTO_RESOURCE_RE.match(v):
            raise ValueError("photo_resource_name must match places/<id>/photos/<id>")
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
    useful_link: str | None = Field(None, max_length=_LOCATION_USEFUL_LINK_MAX)
    requires_booking: str | None = Field(
        None,
        description="One of: no, yes, yes_done",
    )
    category: str | None = None
    google_place_id: str | None = None
    google_source_type: str | None = None
    latitude: float | None = Field(None, ge=-90.0, le=90.0)
    longitude: float | None = Field(None, ge=-180.0, le=180.0)
    photo_resource_name: str | None = None


class LocationResponse(BaseModel):
    """Response body for add-location (201)."""

    id: str = Field(..., description="Location UUID")
    name: str = Field(..., description="Location name")
    address: str | None = None
    google_link: str | None = None
    google_place_id: str | None = None
    google_source_type: str | None = None
    note: str | None = None
    added_by_user_id: str | None = None
    added_by_email: str | None = None
    city: str | None = None
    working_hours: str | None = None
    useful_link: str | None = None
    requires_booking: str | None = None
    category: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = None
    user_image_url: str | None = None
    attribution_name: str | None = None
    attribution_uri: str | None = None


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
    useful_link: str | None = Field(None, max_length=_LOCATION_USEFUL_LINK_MAX)
    requires_booking: str | None = None
    category: str | None = None
    google_place_id: str | None = None
    google_source_type: str | None = None


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
    active_option_id: str | None = Field(
        None,
        description=(
            "UUID of the option to mark as the day's active (user-selected) "
            "option. Pass `null` to clear and fall back to the Main option. "
            "The referenced option MUST belong to this same day; the server "
            "rejects 422 otherwise."
        ),
    )


class DayResponse(BaseModel):
    """Response body for trip day operations."""

    id: str = Field(..., description="Day UUID")
    trip_id: str = Field(..., description="Parent trip UUID")
    date: date_type | None = None
    sort_order: int = Field(..., ge=0)
    created_at: datetime | None = None
    active_option_id: str | None = Field(
        None,
        description=(
            "UUID of the currently-active option for this day, or null. "
            "Persisted across sessions; shared viewers see the owner's value."
        ),
    )


class ReassignDayDateBody(BaseModel):
    """Request body for POST reassign-day-date."""

    new_date: date_type = Field(..., description="The new date to assign to this day")
    option_id: str = Field(..., description="The currently selected option to move")


class ReconcileDaysBody(BaseModel):
    """Request body for POST reconcile-days when trip dates change."""

    action: Literal["shift", "clear_dates", "delete"] = Field(
        ..., description="Action to take on affected days"
    )
    offset_days: int | None = Field(
        None, description="Number of days to shift (required for 'shift' action)"
    )
    day_ids: list[str] | None = Field(
        None, description="Day IDs to affect (required for 'clear_dates' and 'delete')"
    )

    @model_validator(mode="after")
    def validate_action_params(self):
        if self.action == "shift" and self.offset_days is None:
            raise ValueError("offset_days is required for 'shift' action")
        if self.action in ("clear_dates", "delete") and not self.day_ids:
            raise ValueError("day_ids is required for 'clear_dates' and 'delete' actions")
        return self


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

    ol_ids: list[str] = Field(
        ..., min_length=1, description="Ordered list of option_locations.id values"
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
    useful_link: str | None = None
    requires_booking: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = None
    user_image_url: str | None = None
    attribution_name: str | None = None
    attribution_uri: str | None = None


class OptionLocationResponse(BaseModel):
    """Response body for option-locations operations."""

    id: str = Field(..., description="Option-location row UUID (surrogate key)")
    option_id: str = Field(..., description="Option UUID")
    location_id: str = Field(..., description="Location UUID")
    sort_order: int = Field(..., ge=0)
    time_period: str = Field(..., description="morning | afternoon | evening | night")
    location: LocationSummary | None = None


class ItineraryOptionLocation(BaseModel):
    """Itinerary tree node: location entry inside an option."""

    id: str = Field(..., description="Option-location row UUID (surrogate key)")
    location_id: str
    sort_order: int
    time_period: str
    location: LocationSummary


class RouteSegmentSummary(BaseModel):
    """Per-segment metrics in itinerary tree (one per leg between consecutive stops)."""

    segment_order: int = Field(..., ge=0, description="0-based: leg stop[i] to stop[i+1]")
    duration_seconds: int | None = None
    distance_meters: int | None = None
    encoded_polyline: str | None = None


class ItineraryRoute(BaseModel):
    """Itinerary tree node: route within an option."""

    route_id: str
    label: str | None = None
    transport_mode: str = "walk"
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = 0
    option_location_ids: list[str] = Field(default_factory=list)
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
    active_option_id: str | None = None
    options: list[ItineraryOption] = Field(default_factory=list)


class ItineraryResponse(BaseModel):
    """Full itinerary for a trip: list of days with nested options and locations."""

    days: list[ItineraryDay] = Field(default_factory=list)


class LocationPreviewResponse(BaseModel):
    """Response body shared by ``/locations/google/preview`` (URL paste) and
    ``/locations/google/resolve`` (typeahead pick).

    Both endpoints call Place Details (New) Pro and populate this same
    shape so the frontend ``AddLocationForm`` prefill path is identical
    regardless of entry point.

    Fields are limited to what the *Place Details Pro* SKU returns
    (``displayName`` + Essentials tier) plus the photo resource name, which
    is passed back to the client so that ``POST /locations`` can trigger a
    one-off photo fetch on save without a second Place Details call.
    Enterprise-tier data (phone, website, opening hours) is deliberately
    excluded — see ADR on Google Places cost reduction.
    """

    name: str
    address: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    google_place_id: str
    suggested_category: str | None = None
    photo_resource_name: str | None = None


# -------- Google Places autocomplete (typeahead) schemas --------
#
# Cost contract (Places API New, 2026):
#   * /autocomplete invokes Autocomplete (New). FREE when the session ends
#     with a /resolve call carrying the same ``session_token`` (Session Usage
#     SKU). $2.83 / 1000 if the session is abandoned (first 10k/mo free).
#   * /resolve invokes Place Details (New) Pro. $17 / 1000 (first 5k/mo
#     free). Same SKU and field mask as /preview.
# The ``sessionToken`` query param forwarded to the Place Details GET is
# what retroactively makes all preceding autocomplete requests in the
# session FREE.


class LocationBias(BaseModel):
    """Optional geographic bias for autocomplete (circle).

    Narrows Google's ranking toward a region without restricting results.
    Not wired into the frontend in v1; the backend accepts it so future
    callers (trip starting-city biasing) can opt in without schema change.
    """

    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    radius_m: float = Field(..., gt=0.0, le=50000.0)


# Session tokens are client-generated UUIDs. Enforce a reasonably tight
# character set so nothing exotic (XSS, path-traversal sentinels) ever
# reaches the Google API.
_SESSION_TOKEN_PATTERN = r"^[A-Za-z0-9_\-]+$"
_PLACE_ID_PATTERN = r"^[A-Za-z0-9_\-]+$"
# BCP-47-lite: letters only for the primary tag (``en``, ``fra``) with
# optional subtags separated by dashes. Locks down ``language`` / ``region``
# so nothing exotic (CRLF, control chars) can hitch a ride into Google's
# JSON payload.
_LANGUAGE_REGION_PATTERN = r"^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$"


class AutocompleteRequest(BaseModel):
    """Request body for POST /locations/google/autocomplete."""

    input: str = Field(..., min_length=1, max_length=100)
    session_token: str = Field(
        ...,
        min_length=16,
        max_length=128,
        pattern=_SESSION_TOKEN_PATTERN,
    )
    language: str | None = Field(None, max_length=10, pattern=_LANGUAGE_REGION_PATTERN)
    region: str | None = Field(None, max_length=10, pattern=_LANGUAGE_REGION_PATTERN)
    location_bias: LocationBias | None = None


class AutocompleteSuggestionDTO(BaseModel):
    """One suggestion row rendered in the typeahead dropdown."""

    place_id: str
    main_text: str
    secondary_text: str | None = None
    types: list[str] = Field(default_factory=list)


class AutocompleteResponse(BaseModel):
    """Response body for POST /locations/google/autocomplete."""

    suggestions: list[AutocompleteSuggestionDTO]


class ResolvePlaceRequest(BaseModel):
    """Request body for POST /locations/google/resolve.

    ``session_token`` is optional so internal callers that don't run a
    typeahead session (e.g. batch tooling) can reuse this endpoint. When
    present, it is forwarded as the ``?sessionToken=`` query parameter on
    the Place Details (New) call so Google bills the preceding autocomplete
    requests as FREE Session Usage instead of per-request.
    """

    place_id: str = Field(
        ...,
        min_length=1,
        max_length=256,
        pattern=_PLACE_ID_PATTERN,
    )
    session_token: str | None = Field(
        None,
        min_length=16,
        max_length=128,
        pattern=_SESSION_TOKEN_PATTERN,
    )


# -------- Route schemas (option_routes, route_stops) --------

TRANSPORT_MODE_VALUES = frozenset({"walk", "drive", "transit"})


class CreateRouteBody(BaseModel):
    """Request body for POST create-route."""

    transport_mode: str = Field(..., description="One of: walk, drive, transit")
    label: str | None = None
    option_location_ids: list[str] = Field(
        ..., min_length=2, description="Ordered stop option_location UUIDs"
    )

    @field_validator("transport_mode")
    @classmethod
    def validate_transport_mode(cls, v: str) -> str:
        if v not in TRANSPORT_MODE_VALUES:
            raise ValueError("must be one of: walk, drive, transit")
        return v


class UpdateRouteBody(BaseModel):
    """Request body for PATCH update-route. All fields optional."""

    transport_mode: str | None = None
    label: str | None = None
    option_location_ids: list[str] | None = Field(
        None, min_length=2, description="Ordered stop option_location UUIDs"
    )

    @field_validator("transport_mode")
    @classmethod
    def validate_transport_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in TRANSPORT_MODE_VALUES:
            msg = f"transport_mode must be one of {sorted(TRANSPORT_MODE_VALUES)}"
            raise ValueError(msg)
        return v


class RouteResponse(BaseModel):
    """Response body for route operations."""

    route_id: str = Field(..., description="Route UUID")
    option_id: str = Field(..., description="Parent option UUID")
    label: str | None = None
    transport_mode: str = Field(..., description="walk | drive | transit")
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = Field(..., ge=0)
    option_location_ids: list[str] = Field(default_factory=list)
    route_status: str = Field(
        "pending",
        description=(
            "pending = metrics not yet calculated; ok = all segments success; "
            "error = one or more segments failed"
        ),
    )


# -------- Route segment schemas (recalculate, get with segments) --------


class RecalculateRouteBody(BaseModel):
    """Optional body for POST recalculate/refresh route."""

    transport_mode: str | None = Field(
        None, description="walk | drive | transit; default: route's mode"
    )
    force_refresh: bool = Field(
        False, description="If true, recompute all segments (ignore cache/cooldown)"
    )

    @field_validator("transport_mode")
    @classmethod
    def validate_transport_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in TRANSPORT_MODE_VALUES:
            raise ValueError("must be one of: walk, drive, transit")
        return v


class RouteSegmentResponse(BaseModel):
    """One segment (leg): from_location -> to_location; retry metadata when not success."""

    segment_order: int = Field(..., ge=0)
    from_location_id: str = Field(..., description="Location UUID (origin of this leg)")
    to_location_id: str = Field(..., description="Location UUID (destination of this leg)")
    distance_meters: int | None = None
    duration_seconds: int | None = None
    encoded_polyline: str | None = Field(None, description="Google encoded polyline for MapLibre")
    status: str = Field(
        "success",
        description="success | retryable_error | config_error | input_error | no_route",
    )
    error_type: str | None = Field(
        None, description="e.g. forbidden_or_unauthorized, server_or_rate_limit"
    )
    error_message: str | None = None
    provider_http_status: int | None = Field(None, description="e.g. 403, 500")
    next_retry_at: str | None = Field(None, description="ISO8601; next eligible retry on view")


class SharedTripInfo(BaseModel):
    """Trip info returned in public shared view (no user_id)."""

    name: str
    start_date: date_type | None = None
    end_date: date_type | None = None


class ShareTripResponse(BaseModel):
    """Response when creating or fetching a share link."""

    share_token: str
    share_url: str
    created_at: datetime
    expires_at: datetime | None = None


class SharedLocationSummary(BaseModel):
    """Location info for public shared view (no added_by_email)."""

    id: str
    name: str
    city: str | None = None
    address: str | None = None
    google_link: str | None = None
    category: str | None = None
    note: str | None = None
    working_hours: str | None = None
    useful_link: str | None = None
    requires_booking: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = None
    user_image_url: str | None = None
    attribution_name: str | None = None
    attribution_uri: str | None = None


class SharedTripResponse(BaseModel):
    """Full public shared trip view: trip info + locations + itinerary."""

    trip: SharedTripInfo
    locations: list[SharedLocationSummary]
    itinerary: ItineraryResponse


class RouteWithSegmentsResponse(BaseModel):
    """Route plus per-segment data and geometry (for recalculate and get-with-segments)."""

    route_id: str = Field(..., description="Route UUID")
    option_id: str = Field(..., description="Parent option UUID")
    label: str | None = None
    transport_mode: str = Field(..., description="walk | drive | transit")
    duration_seconds: int | None = None
    distance_meters: int | None = None
    sort_order: int = Field(..., ge=0)
    option_location_ids: list[str] = Field(default_factory=list)
    segments: list[RouteSegmentResponse] = Field(default_factory=list)
    route_status: str = Field(
        "ok",
        description=(
            "ok = all segments success; error = one or more segments failed (partial or total)"
        ),
    )


# -------- Google Maps shared list import schemas --------


class ImportGoogleListBody(BaseModel):
    """Request body for importing locations from a Google Maps shared list."""

    google_list_url: str = Field(..., min_length=1, description="Google Maps shared list URL")

    @field_validator("google_list_url")
    @classmethod
    def validate_url_safety(cls, v: str) -> str:
        try:
            return validate_google_maps_url(v)
        except URLValidationError as exc:
            raise ValueError(str(exc)) from exc


class ImportedLocationSummary(BaseModel):
    """Summary of one location in the import result."""

    name: str
    status: str  # "imported", "existing", "failed"
    detail: str | None = None


class ImportGoogleListResponse(BaseModel):
    """Response for bulk import from Google Maps list."""

    imported_count: int
    existing_count: int
    failed_count: int
    imported: list[ImportedLocationSummary]
    existing: list[ImportedLocationSummary]
    failed: list[ImportedLocationSummary]
