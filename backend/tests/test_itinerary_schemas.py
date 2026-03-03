from datetime import date

import pytest

from backend.app.models.schemas import (
    AddOptionLocationBody,
    CreateDayBody,
    CreateOptionBody,
    ItineraryDay,
    ItineraryOption,
    ItineraryOptionLocation,
    ItineraryResponse,
    LocationSummary,
    OptionLocationResponse,
    UpdateDayBody,
    UpdateOptionBody,
    UpdateOptionLocationBody,
)


def test_create_day_body_allows_optional_fields():
    body = CreateDayBody(date=date(2025, 1, 2))
    assert body.date == date(2025, 1, 2)


def test_update_day_body_validation_sort_order_non_negative():
    body = UpdateDayBody(sort_order=0)
    assert body.sort_order == 0

    with pytest.raises(ValueError):
        UpdateDayBody(sort_order=-1)


def test_update_option_body_validates_option_index_ge_one():
    body = UpdateOptionBody(option_index=1)
    assert body.option_index == 1

    with pytest.raises(ValueError):
        UpdateOptionBody(option_index=0)


def test_create_option_body_accepts_city_and_created_by():
    body = CreateOptionBody(starting_city="Paris", ending_city="Lyon", created_by="Alice")
    assert body.starting_city == "Paris"
    assert body.ending_city == "Lyon"
    assert body.created_by == "Alice"


def test_update_option_body_accepts_city_and_created_by():
    body = UpdateOptionBody(starting_city="Nice", created_by="Bob")
    assert body.starting_city == "Nice"
    assert body.created_by == "Bob"
    assert body.option_index is None


def test_add_option_location_body_time_period_enum_validation():
    ok = AddOptionLocationBody(location_id="loc1", sort_order=0, time_period="morning")
    assert ok.time_period == "morning"

    with pytest.raises(ValueError):
        AddOptionLocationBody(location_id="loc1", sort_order=0, time_period="invalid")


def test_update_option_location_body_time_period_optional_validation():
    body = UpdateOptionLocationBody(sort_order=1, time_period=None)
    assert body.time_period is None

    body2 = UpdateOptionLocationBody(sort_order=1, time_period="evening")
    assert body2.time_period == "evening"

    with pytest.raises(ValueError):
        UpdateOptionLocationBody(sort_order=1, time_period="bad")


def test_option_location_response_and_location_summary_shapes():
    summary = LocationSummary(
        id="loc-uuid",
        name="Louvre",
        city="Paris",
        address="Rue de Rivoli",
        google_link="https://maps.google.com/...",
        category="Museum",
        note=None,
        working_hours="9-18",
        requires_booking="no",
    )
    resp = OptionLocationResponse(
        option_id="opt-uuid",
        location_id="loc-uuid",
        sort_order=1,
        time_period="afternoon",
        location=summary,
    )
    assert resp.location is not None
    assert resp.location.name == "Louvre"
    assert resp.sort_order == 1


def test_itinerary_tree_models_compose_correctly():
    summary = LocationSummary(id="loc", name="Name")
    node = ItineraryOptionLocation(
        location_id="loc", sort_order=0, time_period="morning", location=summary
    )
    opt = ItineraryOption(
        id="opt",
        option_index=1,
        starting_city="Paris",
        ending_city="Lyon",
        created_by="Alice",
        locations=[node],
    )
    day = ItineraryDay(id="day", date=None, sort_order=0, options=[opt])
    itinerary = ItineraryResponse(days=[day])

    assert len(itinerary.days) == 1
    assert itinerary.days[0].options[0].starting_city == "Paris"
    assert itinerary.days[0].options[0].created_by == "Alice"
    assert itinerary.days[0].options[0].locations[0].location.name == "Name"
