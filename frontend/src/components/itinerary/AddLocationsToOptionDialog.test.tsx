/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLocationsToOptionDialog } from "./AddLocationsToOptionDialog";

const defaultLocations = [
  {
    id: "loc-1",
    name: "Eiffel Tower",
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Paris",
    working_hours: null,
    requires_booking: null,
    category: "Viewpoint",
    google_place_id: null,
    latitude: null,
    longitude: null,
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Paris",
    working_hours: null,
    requires_booking: null,
    category: "Museum",
    google_place_id: null,
    latitude: null,
    longitude: null,
  },
  {
    id: "loc-3",
    name: "Nice Promenade",
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Nice",
    working_hours: null,
    requires_booking: null,
    category: null,
    google_place_id: null,
    latitude: null,
    longitude: null,
  },
];

function renderDialog(
  props: {
    allLocations?: typeof defaultLocations;
    alreadyAddedIds?: Set<string>;
    startingCity?: string | null;
    endingCity?: string | null;
    onConfirm?: (ids: string[]) => Promise<void>;
  } = {}
) {
  const {
    allLocations = defaultLocations,
    alreadyAddedIds = new Set(),
    startingCity = null,
    endingCity = null,
    onConfirm = vi.fn().mockResolvedValue(undefined),
  } = props;
  return render(
    <AddLocationsToOptionDialog
      trigger={<button>Add locations</button>}
      allLocations={allLocations}
      alreadyAddedIds={alreadyAddedIds}
      startingCity={startingCity}
      endingCity={endingCity}
      onConfirm={onConfirm}
    />
  );
}

describe("AddLocationsToOptionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens when trigger is clicked", async () => {
    renderDialog();
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );
    expect(
      screen.getByRole("heading", { name: /add locations to plan/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/search locations/i)
    ).toBeInTheDocument();
  });

  it("lists available locations (excluding already added)", async () => {
    renderDialog({
      alreadyAddedIds: new Set(["loc-2"]),
    });
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Nice Promenade")).toBeInTheDocument();
    expect(screen.queryByText("Louvre Museum")).not.toBeInTheDocument();
  });

  it("filters list by search", async () => {
    renderDialog();
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );
    const search = screen.getByLabelText(/search locations/i);
    await userEvent.type(search, "nice");

    expect(screen.getByText("Nice Promenade")).toBeInTheDocument();
    expect(screen.queryByText("Eiffel Tower")).not.toBeInTheDocument();
    expect(screen.queryByText("Louvre Museum")).not.toBeInTheDocument();
  });

  it("shows city filter checkbox when starting/ending city provided", async () => {
    renderDialog({ startingCity: "Paris", endingCity: "Nice" });
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );

    expect(
      screen.getByLabelText(/only show locations in paris & nice/i)
    ).toBeInTheDocument();
  });

  it("calls onConfirm with selected location ids when Add is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onConfirm });
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );

    await userEvent.click(
      screen.getByRole("button", { name: /eiffel tower/i })
    );
    await userEvent.click(
      screen.getByRole("button", { name: /louvre museum/i })
    );
    expect(
      screen.getByRole("button", { name: /add 2 locations/i })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /add 2 locations/i })
    );

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(["loc-1", "loc-2"]);
    });
  });

  it("Add button is disabled when none selected", async () => {
    renderDialog();
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );

    expect(
      screen.getByRole("button", { name: /add locations/i })
    ).toBeDisabled();
  });

  it("Cancel closes dialog without calling onConfirm", async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: /add locations to plan/i })
    ).not.toBeInTheDocument();
  });

  it("shows empty state when all locations already added", async () => {
    renderDialog({ alreadyAddedIds: new Set(["loc-1", "loc-2", "loc-3"]) });
    await userEvent.click(
      screen.getByRole("button", { name: /add locations/i })
    );

    expect(
      screen.getByText(/all locations are already added/i)
    ).toBeInTheDocument();
  });
});
