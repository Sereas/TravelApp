/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { LocationRow } from "./LocationRow";

describe("LocationRow", () => {
  it("renders location name", () => {
    render(<LocationRow id="1" name="Eiffel Tower" />);
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
  });

  it("renders note when provided", () => {
    render(<LocationRow id="1" name="Eiffel Tower" note="Visit at sunset" />);
    expect(screen.getByText("Visit at sunset")).toBeInTheDocument();
  });

  it("does not render note when null", () => {
    render(<LocationRow id="1" name="Eiffel Tower" />);
    expect(screen.queryByText("Visit at sunset")).not.toBeInTheDocument();
  });

  it("renders address when provided", () => {
    render(
      <LocationRow
        id="1"
        name="Eiffel Tower"
        address="5 Avenue Anatole France, 75007 Paris"
      />
    );
    expect(
      screen.getByText("5 Avenue Anatole France, 75007 Paris")
    ).toBeInTheDocument();
  });

  it("renders Google Maps link when provided", () => {
    render(
      <LocationRow
        id="1"
        name="Eiffel Tower"
        google_link="https://maps.google.com/?q=eiffel+tower"
      />
    );
    const link = screen.getByRole("link", { name: "Open in Google Maps" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "https://maps.google.com/?q=eiffel+tower"
    );
  });

  it("renders actions slot when provided", () => {
    render(
      <LocationRow id="1" name="Eiffel Tower" actions={<button>Edit</button>} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders city in meta line when provided", () => {
    render(<LocationRow id="1" name="Louvre" city="Paris" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
  });

  it("renders category in meta line when provided", () => {
    render(<LocationRow id="1" name="Louvre" category="Museum" />);
    expect(screen.getByText("Museum")).toBeInTheDocument();
  });

  it("renders requires_booking as label when provided", () => {
    render(<LocationRow id="1" name="Louvre" requires_booking="yes_done" />);
    expect(screen.getByText("Yes (done)")).toBeInTheDocument();
  });

  it("renders city · category · requires_booking meta line when all provided", () => {
    render(
      <LocationRow
        id="1"
        name="Louvre"
        city="Paris"
        category="Museum"
        requires_booking="yes"
      />
    );
    expect(screen.getByText("Paris · Museum · Yes")).toBeInTheDocument();
  });

  it("renders Added by email when added_by_email provided", () => {
    render(
      <LocationRow id="1" name="Louvre" added_by_email="alice@example.com" />
    );
    expect(screen.getByText("Added by alice@example.com")).toBeInTheDocument();
  });

  it("does not render Added by when added_by_email is null", () => {
    render(<LocationRow id="1" name="Louvre" />);
    expect(screen.queryByText(/Added by/)).not.toBeInTheDocument();
  });

  it("renders working_hours in meta line when provided", () => {
    render(<LocationRow id="1" name="Café" working_hours="9:00–18:00" />);
    expect(screen.getByText("9:00–18:00")).toBeInTheDocument();
  });
});
