/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import { PageShell } from "./PageShell";

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

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

describe("PageShell", () => {
  it("renders the header with site name", () => {
    render(<PageShell>content</PageShell>);
    expect(screen.getByText("TravelApp")).toBeInTheDocument();
  });

  it("renders children inside main", () => {
    render(
      <PageShell>
        <p>Test content</p>
      </PageShell>
    );
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent("Test content");
  });

  it("header links to home", () => {
    render(<PageShell>content</PageShell>);
    const link = screen.getByRole("link", { name: /travelapp/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
