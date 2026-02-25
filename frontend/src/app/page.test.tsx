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
      screen.getByText(/trip planning and in-trip assistance/i)
    ).toBeInTheDocument();
  });
});
