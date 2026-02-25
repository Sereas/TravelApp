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

  it("renders actions slot when provided", () => {
    render(
      <LocationRow id="1" name="Eiffel Tower" actions={<button>Edit</button>} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
