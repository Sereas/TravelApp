/// <reference types="vitest/globals" />
/**
 * TripHeader — status badge, dates, progress, share button, name editor.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  sampleTrip,
  sampleTripNoDates,
  sampleItinerary,
  emptyItinerary,
  makeReadOnlyItineraryState,
} from "./__fixtures__/trip-view.fixtures";
import { TripHeader } from "./TripHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "trip-abc" }),
}));

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof TripHeader>> = {}
) {
  const defaults: React.ComponentProps<typeof TripHeader> = {
    trip: sampleTrip,
    itinerary: makeReadOnlyItineraryState(sampleItinerary).itinerary,
    isReadOnly: false,
    canShare: true,
    onBack: undefined,
    onInlineNameSave: vi.fn(),
    onDateRangeSave: vi.fn(),
    onShareClick: vi.fn(),
  };
  return render(<TripHeader {...defaults} {...overrides} />);
}

describe("TripHeader — edit mode", () => {
  it("renders the trip name as a clickable button", () => {
    renderHeader();
    expect(
      screen.getByRole("button", { name: sampleTrip.name })
    ).toBeInTheDocument();
  });

  it("renders the PLANNING status pill", () => {
    renderHeader();
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it("renders a Share button when canShare=true", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("does NOT render Share button when canShare=false", () => {
    renderHeader({ canShare: false });
    expect(
      screen.queryByRole("button", { name: /share/i })
    ).not.toBeInTheDocument();
  });

  it("renders TripDateRangePicker (interactive date button) in edit mode", () => {
    renderHeader();
    expect(
      screen.getByRole("button", { name: /date range/i })
    ).toBeInTheDocument();
  });

  it("clicking the name button switches to edit input", async () => {
    renderHeader();
    await userEvent.click(
      screen.getByRole("button", { name: sampleTrip.name })
    );
    expect(
      screen.getByRole("textbox", { name: /trip name/i })
    ).toBeInTheDocument();
  });

  it("editing name and pressing Enter saves the value", async () => {
    const onSave = vi.fn();
    renderHeader({ onInlineNameSave: onSave });
    await userEvent.click(
      screen.getByRole("button", { name: sampleTrip.name })
    );
    const input = screen.getByRole("textbox", { name: /trip name/i });
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Enter}");
    expect(onSave).toHaveBeenCalledWith("New Name");
  });

  it("pressing Escape cancels the name edit without saving", async () => {
    const onSave = vi.fn();
    renderHeader({ onInlineNameSave: onSave });
    await userEvent.click(
      screen.getByRole("button", { name: sampleTrip.name })
    );
    const input = screen.getByRole("textbox", { name: /trip name/i });
    await userEvent.type(input, "Discarded{Escape}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders Back button when onBack is provided", () => {
    renderHeader({ onBack: vi.fn() });
    expect(
      screen.getByRole("button", { name: /back to trips/i })
    ).toBeInTheDocument();
  });

  it("does NOT render Back button when onBack is undefined", () => {
    renderHeader({ onBack: undefined });
    expect(
      screen.queryByRole("button", { name: /back to trips/i })
    ).not.toBeInTheDocument();
  });

  it("clicking Back calls onBack", async () => {
    const onBack = vi.fn();
    renderHeader({ onBack });
    await userEvent.click(
      screen.getByRole("button", { name: /back to trips/i })
    );
    expect(onBack).toHaveBeenCalled();
  });
});

describe("TripHeader — read-only mode", () => {
  function renderReadOnly(
    overrides: Partial<React.ComponentProps<typeof TripHeader>> = {}
  ) {
    return renderHeader({ isReadOnly: true, canShare: false, ...overrides });
  }

  it("renders trip name as a plain heading, NOT a button", () => {
    renderReadOnly();
    expect(
      screen.getByRole("heading", { name: sampleTrip.name })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: sampleTrip.name })
    ).not.toBeInTheDocument();
  });

  it("renders the date range as plain text (no interactive date picker)", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /date range/i })
    ).not.toBeInTheDocument();
    // Dates appear as text
    expect(screen.getByText(/sep/i)).toBeInTheDocument();
  });

  it("still renders the PLANNING pill", () => {
    renderReadOnly();
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it("does NOT render Share button", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /share/i })
    ).not.toBeInTheDocument();
  });
});

describe("TripHeader — progress indicator", () => {
  it("renders progress when itinerary has days with planned locations", () => {
    renderHeader({ itinerary: sampleItinerary });
    // progress shows "1/1 days" or similar
    expect(screen.getByText(/\d+\/\d+ days/i)).toBeInTheDocument();
  });

  it("does NOT render progress when itinerary has no days", () => {
    renderHeader({ itinerary: emptyItinerary });
    expect(screen.queryByText(/\d+\/\d+ days/i)).not.toBeInTheDocument();
  });
});

describe("TripHeader — edge cases", () => {
  it("renders without crashing when trip has no dates", () => {
    expect(() => renderHeader({ trip: sampleTripNoDates })).not.toThrow();
    expect(screen.getByText("Untitled Trip")).toBeInTheDocument();
  });

  it("status row has flex-wrap class", () => {
    const { container } = renderHeader();
    const planningBadge = screen.getByText(/planning/i);
    let el: HTMLElement | null = planningBadge.parentElement;
    let found = false;
    while (el) {
      if (el.className.includes("flex-wrap")) {
        found = true;
        break;
      }
      el = el.parentElement;
    }
    expect(found).toBe(true);
  });
});
