/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  it("renders error message with alert role", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders retry button when onRetry provided", async () => {
    const handleRetry = vi.fn();
    render(<ErrorBanner message="Failed to load" onRetry={handleRetry} />);
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await userEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(<ErrorBanner message="Error" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
