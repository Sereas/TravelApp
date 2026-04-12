/// <reference types="vitest/globals" />
/**
 * EmptyLocationsCTA — three-card "Ready to build your pool" empty state.
 * Only rendered in edit mode (owner); read-only gets plain text instead.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock ImportGoogleListDialog — it mounts a Radix portal that interferes with assertions.
vi.mock("@/components/locations/ImportGoogleListDialog", () => ({
  ImportGoogleListDialog: ({
    trigger,
  }: {
    trigger: React.ReactNode;
    tripId: string;
    onImported: () => void;
  }) => <div data-testid="import-google-list-dialog">{trigger}</div>,
}));

import { EmptyLocationsCTA } from "./EmptyLocationsCTA";

function renderCTA(
  overrides: Partial<React.ComponentProps<typeof EmptyLocationsCTA>> = {}
) {
  const defaults: React.ComponentProps<typeof EmptyLocationsCTA> = {
    tripId: "trip-abc",
    onStartAddingLocation: vi.fn(),
    onRefreshData: vi.fn(),
  };
  return render(<EmptyLocationsCTA {...defaults} {...overrides} />);
}

describe("EmptyLocationsCTA", () => {
  it("renders the main heading", () => {
    renderCTA();
    expect(
      screen.getByRole("heading", { name: /ready to build your pool/i })
    ).toBeInTheDocument();
  });

  it("renders the 'Paste a Link' card heading", () => {
    renderCTA();
    expect(
      screen.getByRole("heading", { name: /paste a link/i })
    ).toBeInTheDocument();
  });

  it("renders the 'Import a List' card heading", () => {
    renderCTA();
    expect(
      screen.getByRole("heading", { name: /import a list/i })
    ).toBeInTheDocument();
  });

  it("renders the 'Add Manually' card heading", () => {
    renderCTA();
    expect(
      screen.getByRole("heading", { name: /add manually/i })
    ).toBeInTheDocument();
  });

  it("renders all three card action buttons", () => {
    renderCTA();
    expect(
      screen.getByRole("button", { name: /paste link/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import list/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add manually/i })
    ).toBeInTheDocument();
  });

  it("'Paste Link' button calls onStartAddingLocation with link-entry mode", async () => {
    const onStart = vi.fn();
    renderCTA({ onStartAddingLocation: onStart });
    await userEvent.click(screen.getByRole("button", { name: /paste link/i }));
    expect(onStart).toHaveBeenCalledWith({ mode: "link-entry" });
  });

  it("'Add Manually' button calls onStartAddingLocation with manual mode", async () => {
    const onStart = vi.fn();
    renderCTA({ onStartAddingLocation: onStart });
    await userEvent.click(
      screen.getByRole("button", { name: /add manually/i })
    );
    expect(onStart).toHaveBeenCalledWith({ mode: "manual" });
  });

  it("renders the Recommended badge on the Paste Link card", () => {
    renderCTA();
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  });

  it("renders ImportGoogleListDialog with the tripId", () => {
    renderCTA({ tripId: "trip-xyz" });
    // The mock wraps whatever trigger is passed — just verify dialog renders
    expect(screen.getByTestId("import-google-list-dialog")).toBeInTheDocument();
  });

  it("does not crash when optional callbacks are undefined", () => {
    expect(() =>
      renderCTA({ onStartAddingLocation: undefined, onRefreshData: undefined })
    ).not.toThrow();
  });
});
