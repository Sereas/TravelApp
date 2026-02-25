/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders message text", () => {
    render(<EmptyState message="No trips yet" />);
    expect(screen.getByText("No trips yet")).toBeInTheDocument();
  });

  it("renders children (CTA) when provided", () => {
    render(
      <EmptyState message="No trips yet">
        <button>Create trip</button>
      </EmptyState>
    );
    expect(
      screen.getByRole("button", { name: "Create trip" })
    ).toBeInTheDocument();
  });
});
