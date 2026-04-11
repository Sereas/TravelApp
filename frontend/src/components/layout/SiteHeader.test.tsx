/// <reference types="vitest/globals" />
/**
 * SiteHeader — Phase 2 touch-hardening contracts + smoke tests.
 *
 * Contracts tested here:
 *   1. The outer <header> element has `pt-safe-t` so the status bar / notch on
 *      iOS is absorbed by the header background rather than overlapping content.
 *   2. The inner row retains `h-14` fixed height — this is load-bearing for
 *      the downstream sticky tabs bar in TripView which offsets by
 *      `calc(3.5rem + var(--safe-top))` (= 56px + notch). If the inner row
 *      height changes, that calc has to change too.
 *   3. Logo link and UserNav are present (smoke test).
 *
 * JSDOM limitation: CSS custom properties (var(--safe-top)) are not evaluated,
 * so we assert className strings.
 */
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "./SiteHeader";

// next/link renders an <a> in tests — mock to keep it simple.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// next/image — simplified mock.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  ),
}));

// UserNav is a client component with Supabase auth — stub it out.
vi.mock("@/components/layout/UserNav", () => ({
  UserNav: () => <div data-testid="user-nav-mock">UserNav</div>,
}));

describe("SiteHeader — Phase 2 safe-area contract", () => {
  it("outer <header> element has pt-safe-t class for iOS notch absorption", () => {
    const { container } = render(<SiteHeader />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("pt-safe-t");
  });

  it("inner row has h-14 fixed height (downstream sticky top-14 remains accurate)", () => {
    const { container } = render(<SiteHeader />);
    // The inner row is a direct child of <header> — a flex div with h-14.
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    // Find the first div inside the header that contains h-14
    const innerRow = header!.querySelector("div.h-14");
    expect(innerRow).not.toBeNull();
    expect(innerRow!.className).toContain("h-14");
  });

  it("logo link points to /", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: /shtab travel/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("logo image is present with alt text", () => {
    render(<SiteHeader />);
    const logo = screen.getByAltText(/shtab travel logo/i);
    expect(logo).toBeInTheDocument();
  });

  it("renders UserNav inside the header", () => {
    render(<SiteHeader />);
    expect(screen.getByTestId("user-nav-mock")).toBeInTheDocument();
  });
});
