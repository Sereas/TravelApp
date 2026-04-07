/// <reference types="vitest/globals" />
import { render } from "@testing-library/react";
import { TripGradient, generateTripBackground } from "./TripGradient";

function getDataAttr(container: HTMLElement): string {
  return (container.firstChild as HTMLElement).dataset.gradient ?? "";
}

describe("TripGradient", () => {
  // DOM structure
  it("renders a div element", () => {
    const { container } = render(<TripGradient name="Tokyo Adventure" />);
    const div = container.firstChild as HTMLElement;
    expect(div).not.toBeNull();
    expect(div.tagName).toBe("DIV");
  });

  it("applies the provided className", () => {
    const { container } = render(
      <TripGradient name="Tokyo Adventure" className="h-48 w-full" />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("h-48");
    expect(div.className).toContain("w-full");
  });

  it("sets aria-hidden on the root div", () => {
    const { container } = render(<TripGradient name="Rome" />);
    expect(
      (container.firstChild as HTMLElement).getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("contains an SVG element with contour paths", () => {
    const { container } = render(<TripGradient name="Alps" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const paths = svg!.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(6);
  });

  // Determinism
  it("same name produces the same contour data", () => {
    const { container: c1 } = render(<TripGradient name="Mediterranean" />);
    const { container: c2 } = render(<TripGradient name="Mediterranean" />);
    expect(getDataAttr(c1)).toBe(getDataAttr(c2));
  });

  it("same name via helper produces the same output", () => {
    expect(generateTripBackground("Iceland")).toBe(
      generateTripBackground("Iceland")
    );
  });

  it("different names produce different contours", () => {
    const { container: c1 } = render(<TripGradient name="Sahara" />);
    const { container: c2 } = render(<TripGradient name="Arctic" />);
    expect(getDataAttr(c1)).not.toBe(getDataAttr(c2));
  });

  it("case sensitivity — different case produces different output", () => {
    expect(generateTripBackground("tokyo")).not.toBe(
      generateTripBackground("Tokyo")
    );
  });

  // SVG structure
  it("paths have stroke but no fill", () => {
    const { container } = render(<TripGradient name="Kyoto" />);
    const path = container.querySelector("path")!;
    expect(path.getAttribute("fill")).toBe("none");
    expect(path.getAttribute("stroke")).toBeTruthy();
  });

  it("paths use colors from the palette", () => {
    const { container } = render(<TripGradient name="Bali" />);
    const path = container.querySelector("path")!;
    const stroke = path.getAttribute("stroke")!;
    expect(stroke).toMatch(/^#[0-9a-f]{6}$/i);
  });

  // Edge cases
  it("handles empty string name", () => {
    expect(() => render(<TripGradient name="" />)).not.toThrow();
    const { container } = render(<TripGradient name="" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("handles very long name", () => {
    expect(() =>
      render(<TripGradient name={"A".repeat(1000)} />)
    ).not.toThrow();
  });

  it("handles unicode / emoji", () => {
    expect(() => render(<TripGradient name="Paris 🗼" />)).not.toThrow();
  });

  it("handles special characters", () => {
    expect(() =>
      render(<TripGradient name="Trip; DROP TABLE;" />)
    ).not.toThrow();
  });

  // Re-render
  it("updates when name changes", () => {
    const { container, rerender } = render(<TripGradient name="One" />);
    const bg1 = getDataAttr(container);
    rerender(<TripGradient name="Two" />);
    expect(getDataAttr(container)).not.toBe(bg1);
  });

  it("stable when only className changes", () => {
    const { container, rerender } = render(
      <TripGradient name="Stable" className="h-32" />
    );
    const bg1 = getDataAttr(container);
    rerender(<TripGradient name="Stable" className="h-64" />);
    expect(getDataAttr(container)).toBe(bg1);
  });
});
