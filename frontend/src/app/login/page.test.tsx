/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockGet = vi.fn(() => null);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, replace: vi.fn() }),
  useSearchParams: () => ({ get: mockGet }),
}));

const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignUp = vi.fn();

const mockGetUser = vi.fn(() =>
  Promise.resolve({ data: { user: null } })
);

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      resetPasswordForEmail: mockResetPasswordForEmail,
      signUp: mockSignUp,
      getUser: () => mockGetUser(),
    },
  }),
}));

describe("LoginPage — Sign in mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email, password, and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^sign in$/i })
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

  it("renders create account toggle link", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("button", { name: /create one/i })
    ).toBeInTheDocument();
  });

  it("calls signInWithPassword on form submit and redirects on success", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@test.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

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

describe("LoginPage — Sign up mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches to sign-up mode when toggle clicked", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));

    expect(
      screen.getByRole("heading", { name: /create an account/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });

  it("switches back to sign-in mode", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      screen.getByRole("heading", { name: /welcome back/i })
    ).toBeInTheDocument();
  });

  it("shows confirm password field in sign-up mode", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));

    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("does not show confirm password field in sign-in mode", () => {
    render(<LoginPage />);
    expect(
      screen.queryByLabelText(/confirm password/i)
    ).not.toBeInTheDocument();
  });

  it("calls signUp and shows confirmation message on success", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "password123"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "new@test.com",
      password: "password123",
      options: expect.objectContaining({ emailRedirectTo: expect.any(String) }),
    });
    expect(
      await screen.findByText(/confirmation email sent/i)
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows error when passwords do not match", async () => {
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "different456"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    expect(
      await screen.findByText(/passwords do not match/i)
    ).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows error on failed sign-up", async () => {
    mockSignUp.mockResolvedValue({
      error: { message: "User already registered" },
    });
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/email/i), "dup@test.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "password123"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    expect(
      await screen.findByText("User already registered")
    ).toBeInTheDocument();
  });

  it("does not show forgot password in sign-up mode", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));

    expect(
      screen.queryByRole("button", { name: /forgot your password/i })
    ).not.toBeInTheDocument();
  });

  it("hides form after confirmation sent and shows sign-in toggle", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(
      screen.getByLabelText(/confirm password/i),
      "password123"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    await screen.findByText(/confirmation email sent/i);
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });
});
