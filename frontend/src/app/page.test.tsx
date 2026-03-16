/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the app title and description", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /shtab travel/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your travel planning headquarters/i)
    ).toBeInTheDocument();
  });

  it("renders get started link", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: /get started/i })
    ).toBeInTheDocument();
  });
});
