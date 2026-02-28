/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { LocationCard } from "./LocationCard";

describe("LocationCard", () => {
  it("renders location name", () => {
    render(<LocationCard id="1" name="Eiffel Tower" />);
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
  });

  it("renders category badge with icon when provided", () => {
    render(<LocationCard id="1" name="Louvre" category="Museum" />);
    expect(screen.getByText("Museum")).toBeInTheDocument();
  });

  it("renders city with MapPin icon", () => {
    render(<LocationCard id="1" name="Louvre" city="Paris" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
  });

  it("renders city and address combined", () => {
    render(
      <LocationCard id="1" name="Louvre" city="Paris" address="Rue de Rivoli" />
    );
    expect(screen.getByText("Paris · Rue de Rivoli")).toBeInTheDocument();
  });

  it("renders address alone when no city", () => {
    render(<LocationCard id="1" name="Louvre" address="Rue de Rivoli" />);
    expect(screen.getByText("Rue de Rivoli")).toBeInTheDocument();
  });

  it("renders Google Maps link inline with address", () => {
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
  });

  it("renders standalone Google Maps link when no city/address", () => {
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

  it("renders working hours with clock context", () => {
    render(<LocationCard id="1" name="Louvre" working_hours="9:00-18:00" />);
    expect(screen.getByText("9:00-18:00")).toBeInTheDocument();
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

  it("renders note with italic styling", () => {
    render(
      <LocationCard id="1" name="Louvre" note="Book tickets in advance" />
    );
    const noteEl = screen.getByText("Book tickets in advance");
    expect(noteEl).toBeInTheDocument();
    expect(noteEl).toHaveClass("italic");
  });

  it("renders added_by_email", () => {
    render(
      <LocationCard id="1" name="Louvre" added_by_email="alice@example.com" />
    );
    expect(screen.getByText("Added by alice@example.com")).toBeInTheDocument();
  });

  it("does not render added_by_email when null", () => {
    render(<LocationCard id="1" name="Louvre" />);
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument();
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
    expect(screen.getByText("Paris · Champ de Mars")).toBeInTheDocument();
    expect(screen.getByText("9:30-23:00")).toBeInTheDocument();
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
    expect(screen.getByText("Must visit at sunset")).toBeInTheDocument();
    expect(screen.getByText("Added by alice@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open in google maps/i })
    ).toBeInTheDocument();
  });
});
