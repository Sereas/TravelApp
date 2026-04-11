/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { MapMarker } from "./MapMarker";

describe("MapMarker", () => {
  it("renders without throwing for a valid known category", () => {
    render(<MapMarker category="Restaurant" name="Le Bistro" />);
    // The title attribute is the most reliable anchor since the component
    // uses pointer-events: none on the outer div.
    expect(document.querySelector('[title="Le Bistro"]')).toBeTruthy();
  });

  it("falls back to 'Other' category for an unknown category string", () => {
    // Should not throw even with a completely unknown category.
    expect(() =>
      render(<MapMarker category="UnknownCategoryXYZ" name="Test Place" />)
    ).not.toThrow();
  });

  it("shows the hover label when isHovered=true and isOpen=false", () => {
    render(
      <MapMarker
        category="Museum"
        name="Louvre Museum"
        isHovered={true}
        isOpen={false}
      />
    );
    // The label pill renders the name text inside it when hovered
    expect(screen.getByText("Louvre Museum")).toBeTruthy();
  });

  it("hides the hover label when isOpen=true (popup open suppresses label)", () => {
    const { container } = render(
      <MapMarker
        category="Museum"
        name="Louvre Museum"
        isHovered={true}
        isOpen={true}
      />
    );
    // When both hovered and open, showLabel = isHovered && !isOpen = false.
    // The label pill (which contains text next to CategoryIcon) should not
    // be present. The title attr on the outer div is still there.
    // The pill div has class "absolute bottom-full" — confirm it's absent.
    const pill = container.querySelector(".absolute.bottom-full");
    expect(pill).toBeNull();
  });
});
