/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockResetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email, password, and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in$/i })
    ).toBeInTheDocument();
  });

  it("renders Google sign-in button", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
  });

  it("renders forgot password link", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("button", { name: /forgot your password/i })
    ).toBeInTheDocument();
  });

  it("calls signInWithPassword on form submit and redirects on success", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in$/i }));

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "user@test.com",
      password: "password123",
    });
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("shows error message on failed login", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: "Invalid credentials" },
    });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "bad@test.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in$/i }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("calls signInWithOAuth for Google login", async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" })
    );
  });

  it("calls resetPasswordForEmail for forgot password", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.click(
      screen.getByRole("button", { name: /forgot your password/i })
    );

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "user@test.com",
      expect.any(Object)
    );
    expect(
      await screen.findByText(/password reset link sent/i)
    ).toBeInTheDocument();
  });

  it("shows error when forgot password clicked without email", async () => {
    render(<LoginPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /forgot your password/i })
    );

    expect(
      await screen.findByText(/enter your email address first/i)
    ).toBeInTheDocument();
  });
});
