"""Request/response schemas for trips API."""

from datetime import date

from pydantic import BaseModel, Field


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


class AddLocationBody(BaseModel):
    """Request body for POST add-location."""

    name: str = Field(..., min_length=1, description="Location name (required)")
    address: str | None = None
    google_link: str | None = None
    note: str | None = None


class LocationResponse(BaseModel):
    """Response body for add-location (201)."""

    id: str = Field(..., description="Location UUID")
    name: str = Field(..., description="Location name")
    address: str | None = None
    google_link: str | None = None
    note: str | None = None


# Batch add: same shape as AddLocationBody per item
BatchAddLocationItem = AddLocationBody


class UpdateTripBody(BaseModel):
    """Request body for PATCH update-trip."""

    name: str | None = Field(None, min_length=1, description="New trip display name")
    start_date: date | None = None
    end_date: date | None = None


class UpdateLocationBody(BaseModel):
    """Request body for PATCH update-location."""

    name: str | None = Field(None, min_length=1, description="New location name")
    address: str | None = None
    google_link: str | None = None
    note: str | None = None
