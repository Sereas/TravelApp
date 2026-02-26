/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserNav } from "./UserNav";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

describe("UserNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 302 }))
    );
  });

  it("renders nothing when no user is logged in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(<UserNav />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders email and sign-out button when user is logged in", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@test.com" } },
    });
    render(<UserNav />);
    expect(await screen.findByText("user@test.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out/i })
    ).toBeInTheDocument();
  });

  it("calls logout endpoint and redirects on sign out", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@test.com" } },
    });
    render(<UserNav />);
    await screen.findByText("user@test.com");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(global.fetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
    });
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
