/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the app title and description", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /travelapp/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/plan trips, collect locations/i)
    ).toBeInTheDocument();
  });

  it("renders sign-in link", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: /sign in to get started/i })
    ).toBeInTheDocument();
  });
});
