/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripCard } from "./TripCard";

describe("TripCard", () => {
  it("renders trip name", () => {
    render(<TripCard id="1" name="Paris Trip" />);
    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
  });

  it("renders date range when both dates provided", () => {
    render(
      <TripCard
        id="1"
        name="Trip"
        startDate="2026-06-01"
        endDate="2026-06-10"
      />
    );
    expect(screen.getByText("2026-06-01 — 2026-06-10")).toBeInTheDocument();
  });

  it("renders only start date when end date is null", () => {
    render(<TripCard id="1" name="Trip" startDate="2026-06-01" />);
    expect(screen.getByText("2026-06-01")).toBeInTheDocument();
  });

  it("does not render date when both are null", () => {
    const { container } = render(<TripCard id="1" name="Trip" />);
    const description = container.querySelector("[class*='CardDescription']");
    expect(description).toBeNull();
  });

  it("calls onClick with trip id when clicked", async () => {
    const handleClick = vi.fn();
    render(<TripCard id="trip-42" name="Trip" onClick={handleClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledWith("trip-42");
  });

  it("is keyboard accessible when clickable", async () => {
    const handleClick = vi.fn();
    render(<TripCard id="trip-42" name="Trip" onClick={handleClick} />);
    const card = screen.getByRole("button");
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(handleClick).toHaveBeenCalledWith("trip-42");
  });
});
