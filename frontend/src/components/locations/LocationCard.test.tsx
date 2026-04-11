/// <reference types="vitest/globals" />
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("address allows up to two lines instead of truncating to one", () => {
    const longAddress =
      "123 Avenue de la Republique, 75011 Paris, Île-de-France, France";
    render(<LocationCard id="1" name="Louvre" address={longAddress} />);
    const el = screen.getByText(longAddress);
    // Narrower card sidebar widths need the address to flow onto two lines
    // instead of truncating with ellipsis after a few characters.
    expect(el).toHaveClass("line-clamp-2");
    expect(el).not.toHaveClass("truncate");
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

  it("booking needed badge stays on a single line at narrow widths", () => {
    render(<LocationCard id="1" name="Louvre" requires_booking="yes" />);
    // Prevent the pill from wrapping to 2 lines and obscuring the image
    // attribution bar when the card is narrow (xl:grid-cols sidebar widened).
    expect(screen.getByText("Booking needed")).toHaveClass("whitespace-nowrap");
  });

  it("category pill stays on a single line at narrow widths", () => {
    render(<LocationCard id="1" name="Louvre" category="Cultural Heritage" />);
    expect(screen.getByText("Cultural Heritage")).toHaveClass(
      "whitespace-nowrap"
    );
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

  // --- data-location-id anchor (for scroll-to-card from sidebar map) ---

  it("sets data-location-id on the root element matching the id prop", () => {
    render(<LocationCard id="loc-abc-123" name="Eiffel Tower" />);
    const card = document.querySelector('[data-location-id="loc-abc-123"]');
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("Eiffel Tower");
  });

  it("data-location-id matches a different id when id prop changes", () => {
    render(<LocationCard id="other-id" name="Louvre" />);
    expect(
      document.querySelector('[data-location-id="other-id"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[data-location-id="loc-abc-123"]')
    ).toBeNull();
  });

  // --- Highlight animation (triggered when sidebar pin is clicked) ---

  it("does NOT apply highlight animation class when isHighlighted is false or omitted", () => {
    const { container, rerender } = render(
      <LocationCard id="1" name="Louvre" />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toContain("animate-location-highlight");

    rerender(<LocationCard id="1" name="Louvre" isHighlighted={false} />);
    const rootAfter = container.firstChild as HTMLElement;
    expect(rootAfter.className).not.toContain("animate-location-highlight");
  });

  it("applies highlight animation class when isHighlighted is true", () => {
    const { container } = render(
      <LocationCard id="1" name="Louvre" isHighlighted />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("animate-location-highlight");
  });

  it("toggles highlight class off on rerender from true to false", () => {
    const { container, rerender } = render(
      <LocationCard id="1" name="Louvre" isHighlighted />
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      "animate-location-highlight"
    );

    rerender(<LocationCard id="1" name="Louvre" isHighlighted={false} />);
    expect((container.firstChild as HTMLElement).className).not.toContain(
      "animate-location-highlight"
    );
  });

  // ===========================================================================
  // Phase 2 — Touch hardening contracts
  // ===========================================================================

  it("three-dot menu button has hover-none:opacity-100 class (always visible on touch)", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    const menuBtn = screen.getByRole("button", { name: /location actions/i });
    expect(menuBtn.className).toContain("hover-none:opacity-100");
  });

  it("three-dot menu button has hover-hover:opacity-0 class (hidden until hover on pointer devices)", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    const menuBtn = screen.getByRole("button", { name: /location actions/i });
    expect(menuBtn.className).toContain("hover-hover:opacity-0");
  });

  it("three-dot menu button has no bare opacity-0 class (regression: was unconditionally invisible)", () => {
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    const menuBtn = screen.getByRole("button", { name: /location actions/i });
    // The bare `opacity-0` class (not prefixed with a variant) must not appear.
    // A variant-prefixed form like `hover-hover:opacity-0` is acceptable.
    expect(menuBtn.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
  });

  it("camera button has hover-none:opacity-100 class (always visible on touch)", () => {
    const noop = async () => {};
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onPhotoUpload={noop}
        onPhotoReset={noop}
      />
    );
    const cameraBtn = screen.getByRole("button", { name: /upload photo/i });
    expect(cameraBtn.className).toContain("hover-none:opacity-100");
  });

  it("camera button has hover-hover:opacity-0 class (hidden until hover on pointer devices)", () => {
    const noop = async () => {};
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onPhotoUpload={noop}
        onPhotoReset={noop}
      />
    );
    const cameraBtn = screen.getByRole("button", { name: /upload photo/i });
    expect(cameraBtn.className).toContain("hover-hover:opacity-0");
  });

  it("camera button has no bare opacity-0 class (regression guard)", () => {
    const noop = async () => {};
    render(
      <LocationCard
        id="1"
        name="Louvre"
        onPhotoUpload={noop}
        onPhotoReset={noop}
      />
    );
    const cameraBtn = screen.getByRole("button", { name: /upload photo/i });
    expect(cameraBtn.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
  });

  // --- onCardClick nested-interactive-element guard ---

  it("fires onCardClick when the card body itself is clicked", () => {
    const handle = vi.fn();
    const { container } = render(
      <LocationCard id="1" name="Louvre" onCardClick={handle} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onCardClick when a nested button is clicked", async () => {
    const user = userEvent.setup();
    const handle = vi.fn();
    render(
      <LocationCard
        id="1"
        name="Louvre"
        working_hours="Mon: 9-5 | Tue: 9-5 | Wed: 9-5"
        onCardClick={handle}
      />
    );
    await user.click(
      screen.getByRole("button", { name: /view opening hours/i })
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it("does NOT fire onCardClick when the Google Maps link is clicked", () => {
    const handle = vi.fn();
    render(
      <LocationCard
        id="1"
        name="Louvre"
        google_link="https://maps.google.com/?q=louvre"
        onCardClick={handle}
      />
    );
    fireEvent.click(screen.getByRole("link", { name: /open in google maps/i }));
    expect(handle).not.toHaveBeenCalled();
  });
});
