import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripSummaryCard } from "./TripSummaryCard";
import type { Location } from "@/lib/api";

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    name: "Test Location",
    address: null,
    google_link: null,
    google_place_id: null,
    note: null,
    added_by_user_id: null,
    added_by_email: "alice@test.com",
    city: null,
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    category: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    user_image_crop: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
    ...overrides,
  };
}

describe("TripSummaryCard", () => {
  it("renders Trip Summary heading", () => {
    render(<TripSummaryCard locations={[]} addedByEmails={new Set()} />);
    expect(screen.getByText("Trip Summary")).toBeInTheDocument();
  });

  it("shows dash placeholder for estimated budget", () => {
    render(<TripSummaryCard locations={[]} addedByEmails={new Set()} />);
    expect(screen.getByText("Estimated Budget")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows stays booked count from locations", () => {
    const locations = [
      makeLocation({ id: "1", requires_booking: "yes_done" }),
      makeLocation({ id: "2", requires_booking: "yes" }),
      makeLocation({ id: "3", requires_booking: "yes" }),
    ];
    render(<TripSummaryCard locations={locations} addedByEmails={new Set()} />);
    expect(screen.getByText("1 / 3 Booked")).toBeInTheDocument();
  });

  it("shows 'No bookings needed' when no bookable locations", () => {
    const locations = [
      makeLocation({ id: "1", requires_booking: "no" }),
      makeLocation({ id: "2", requires_booking: null }),
    ];
    render(<TripSummaryCard locations={locations} addedByEmails={new Set()} />);
    expect(screen.getByText("No bookings needed")).toBeInTheDocument();
  });

  it("renders traveler avatars for each email", () => {
    const emails = new Set(["alice@test.com", "bob@test.com"]);
    render(<TripSummaryCard locations={[]} addedByEmails={emails} />);
    expect(screen.getByTitle("alice@test.com")).toBeInTheDocument();
    expect(screen.getByTitle("bob@test.com")).toBeInTheDocument();
  });

  it("shows +N overflow when more than 3 travelers", () => {
    const emails = new Set([
      "a@t.com",
      "b@t.com",
      "c@t.com",
      "d@t.com",
      "e@t.com",
    ]);
    render(<TripSummaryCard locations={[]} addedByEmails={emails} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("shows 'No travelers yet' when no emails", () => {
    render(<TripSummaryCard locations={[]} addedByEmails={new Set()} />);
    expect(screen.getByText("No travelers yet")).toBeInTheDocument();
  });
});
