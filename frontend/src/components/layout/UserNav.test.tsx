/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserNav } from "./UserNav";

const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

describe("UserNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    // @ts-expect-error -- partial mock for jsdom
    delete window.location;
    // @ts-expect-error -- partial mock for jsdom
    window.location = { href: "" };
  });

  it("renders nothing when no user is logged in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(<UserNav />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders profile button when user is logged in", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@test.com" } },
    });
    render(<UserNav />);
    expect(
      await screen.findByRole("button", { name: /profile menu/i })
    ).toBeInTheDocument();
  });

  it("shows email and sign-out in popover when profile is clicked", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@test.com" } },
    });
    render(<UserNav />);
    await userEvent.click(
      await screen.findByRole("button", { name: /profile menu/i })
    );

    expect(await screen.findByText("user@test.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out/i })
    ).toBeInTheDocument();
  });

  it("calls client-side signOut and hard-navigates to /login", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@test.com" } },
    });
    render(<UserNav />);
    await userEvent.click(
      await screen.findByRole("button", { name: /profile menu/i })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /sign out/i })
    );

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(window.location.href).toBe("/login");
  });
});
