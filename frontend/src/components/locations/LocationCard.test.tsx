/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationCard } from "./LocationCard";

describe("LocationCard", () => {
  it("renders location name", () => {
    render(<LocationCard id="1" name="Eiffel Tower" />);
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
  });

  it("renders category text when provided", () => {
    render(<LocationCard id="1" name="Louvre" category="Museum" />);
    expect(screen.getByText("Museum")).toBeInTheDocument();
  });

  it("renders city with MapPin icon", () => {
    render(<LocationCard id="1" name="Louvre" city="Paris" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
  });

  it("renders city and address separately", () => {
    render(
      <LocationCard id="1" name="Louvre" city="Paris" address="Rue de Rivoli" />
    );
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Rue de Rivoli")).toBeInTheDocument();
  });

  it("renders address alone when no city", () => {
    render(<LocationCard id="1" name="Louvre" address="Rue de Rivoli" />);
    expect(screen.getByText("Rue de Rivoli")).toBeInTheDocument();
  });

  it("renders Details link when google_link provided", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        city="Paris"
        google_link="https://maps.google.com/?q=louvre"
      />
    );
    const link = screen.getByRole("link", { name: /open in google maps/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://maps.google.com/?q=louvre");
    expect(screen.getByText(/Details/)).toBeInTheDocument();
  });

  it("renders standalone Location details link when no city/address", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        google_link="https://maps.google.com/?q=louvre"
      />
    );
    const link = screen.getByRole("link", { name: /open in google maps/i });
    expect(link).toBeInTheDocument();
  });

  it("renders simple working hours inline", () => {
    render(<LocationCard id="1" name="Louvre" working_hours="9:00-18:00" />);
    expect(screen.getByText("9:00-18:00")).toBeInTheDocument();
    expect(screen.queryByText("View opening hours")).not.toBeInTheDocument();
  });

  it("shows View opening hours for detailed weekly schedule", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        working_hours="Mon: Closed | Tue: 9:30 AM–6:00 PM | Wed: 9:30 AM–6:00 PM"
      />
    );
    expect(screen.getByText("View opening hours")).toBeInTheDocument();
    expect(screen.queryByText("Mon: Closed")).not.toBeInTheDocument();
  });

  it("expands and shows full schedule when View opening hours is clicked", async () => {
    const user = userEvent.setup();
    render(
      <LocationCard
        id="1"
        name="Louvre"
        working_hours="Mon: Closed | Tue: 9:30 AM–6:00 PM"
      />
    );
    await user.click(
      screen.getByRole("button", { name: /view opening hours/i })
    );
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("9:30 AM–6:00 PM")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /collapse opening hours/i })
    );
    expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  });

  it("renders booking needed badge for requires_booking=yes", () => {
    render(<LocationCard id="1" name="Louvre" requires_booking="yes" />);
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
  });

  it("renders booked badge for requires_booking=yes_done", () => {
    render(<LocationCard id="1" name="Louvre" requires_booking="yes_done" />);
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
  });

  it("does not render booking badge when requires_booking=no", () => {
    render(<LocationCard id="1" name="Louvre" requires_booking="no" />);
    expect(screen.queryByText("Booking needed")).not.toBeInTheDocument();
    expect(screen.queryByText(/Booked/)).not.toBeInTheDocument();
  });

  it("renders note in a prominent block", () => {
    render(
      <LocationCard id="1" name="Louvre" note="Book tickets in advance" />
    );
    const noteEl = screen.getByText("Book tickets in advance");
    expect(noteEl).toBeInTheDocument();
  });

  it("collapses long notes and expands with more/less toggle", async () => {
    const user = userEvent.setup();
    const longNote =
      "This is a very long note that exceeds the character threshold so it gets collapsed by default and the user can expand it to read the full content.";
    render(<LocationCard id="1" name="Louvre" note={longNote} />);
    expect(screen.getByText(/more/)).toBeInTheDocument();
    expect(screen.queryByText(longNote)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /more/ }));
    expect(screen.getByText(longNote)).toBeInTheDocument();
    expect(screen.getByText(/less/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /less/ }));
    expect(screen.queryByText(longNote)).not.toBeInTheDocument();
    expect(screen.getByText(/more/)).toBeInTheDocument();
  });

  it("renders Added by footer when added_by_email is provided", () => {
    render(
      <LocationCard id="1" name="Louvre" added_by_email="alice@example.com" />
    );
    expect(screen.getByText(/Added by/)).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
  });

  it("does not render Added by footer when added_by_email is null", () => {
    render(<LocationCard id="1" name="Louvre" />);
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(
      <LocationCard id="1" name="Louvre" actions={<button>Edit</button>} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders a sparse card (name only) without errors", () => {
    render(<LocationCard id="1" name="Random Place" />);
    expect(screen.getByText("Random Place")).toBeInTheDocument();
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument();
    expect(screen.queryByText("Booking needed")).not.toBeInTheDocument();
  });

  it("renders a fully populated card", () => {
    render(
      <LocationCard
        id="1"
        name="Eiffel Tower"
        city="Paris"
        address="Champ de Mars"
        google_link="https://maps.google.com"
        category="Viewpoint"
        working_hours="9:30-23:00"
        requires_booking="yes"
        note="Must visit at sunset"
        added_by_email="alice@example.com"
      />
    );
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Viewpoint")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Champ de Mars")).toBeInTheDocument();
    expect(screen.getByText("9:30-23:00")).toBeInTheDocument();
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
    expect(screen.getByText("Must visit at sunset")).toBeInTheDocument();
    expect(screen.getByText(/Added by/)).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open in google maps/i })
    ).toBeInTheDocument();
  });

  // --- Itinerary status tests ---

  it("shows 'Not scheduled' when inItinerary is false or undefined", () => {
    render(<LocationCard id="1" name="Louvre" />);
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
  });

  it("shows 'Scheduled' when inItinerary is true", () => {
    render(<LocationCard id="1" name="Louvre" inItinerary />);
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.queryByText("Not scheduled")).not.toBeInTheDocument();
  });

  it("shows day label when inItinerary with itineraryDayLabel", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        inItinerary
        itineraryDayLabel="May 15"
      />
    );
    expect(screen.getByText("Scheduled \u00B7 May 15")).toBeInTheDocument();
  });

  it("shows multiple day labels", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        inItinerary
        itineraryDayLabel="May 15, May 17"
      />
    );
    expect(
      screen.getByText("Scheduled \u00B7 May 15, May 17")
    ).toBeInTheDocument();
  });

  // --- Schedule to day tests ---

  it("shows 'Schedule to day' button when availableDays provided and not in itinerary", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        availableDays={[
          { id: "d1", label: "May 15" },
          { id: "d2", label: "May 16" },
        ]}
        onScheduleToDay={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /schedule to a day/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Not scheduled")).not.toBeInTheDocument();
  });

  it("calls onScheduleToDay when a day is picked", async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn();
    render(
      <LocationCard
        id="1"
        name="Louvre"
        availableDays={[
          { id: "d1", label: "May 15" },
          { id: "d2", label: "May 16" },
        ]}
        onScheduleToDay={onSchedule}
      />
    );
    await user.click(
      screen.getByRole("button", { name: /schedule to a day/i })
    );
    await user.click(screen.getByText("May 16"));
    expect(onSchedule).toHaveBeenCalledWith("d2");
  });

  it("shows 'Not scheduled' when no availableDays and not in itinerary", () => {
    render(<LocationCard id="1" name="Louvre" />);
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
  });

  it("shows 'Scheduled' (not schedule button) when inItinerary even if days available", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        inItinerary
        itineraryDayLabel="May 15"
        availableDays={[{ id: "d1", label: "May 15" }]}
        onScheduleToDay={() => {}}
      />
    );
    expect(screen.getByText("Scheduled · May 15")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /schedule to a day/i })
    ).not.toBeInTheDocument();
  });

  it("has image placeholder area at top of card", () => {
    const { container } = render(
      <LocationCard id="1" name="Louvre" inItinerary category="Museum" />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("rounded-xl");
    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
  });
});
