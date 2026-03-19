/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the hero heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /plan your next adventure/i })
    ).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<HomePage />);
    expect(
      screen.getByText(/collect places, build day-by-day itineraries/i)
    ).toBeInTheDocument();
  });

  it("renders get started link", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: /get started/i })
    ).toBeInTheDocument();
  });

  it("renders feature cards", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /save places/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /plan your days/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /see routes/i })
    ).toBeInTheDocument();
  });
});
