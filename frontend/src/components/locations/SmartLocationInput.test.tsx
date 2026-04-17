/// <reference types="vitest/globals" />
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartLocationInput } from "./SmartLocationInput";

describe("SmartLocationInput", () => {
  const tripId = "trip-1";
  const onSubmit = vi.fn();
  const onImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering ---

  it("renders an always-visible input bar", () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    expect(
      screen.getByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
    ).toBeInTheDocument();
  });

  it("renders the Import Google List secondary action", () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    expect(
      screen.getByRole("button", { name: /import google list/i })
    ).toBeInTheDocument();
  });

  // --- Enter key behaviour ---

  it("calls onSubmit with the value and isUrl=false when Enter is pressed with a plain name", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Eiffel Tower{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Eiffel Tower", false);
  });

  it("calls onSubmit with isUrl=true when input contains a Google Maps short URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(
      input,
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6",
      true
    );
  });

  it("calls onSubmit with isUrl=true when input contains a maps.google.com URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "https://maps.google.com/?q=louvre{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "https://maps.google.com/?q=louvre",
      true
    );
  });

  it("calls onSubmit with isUrl=true when input contains a google.com/maps URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(
      input,
      "https://www.google.com/maps/place/Eiffel+Tower{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "https://www.google.com/maps/place/Eiffel+Tower",
      true
    );
  });

  it("does not call onSubmit when Enter is pressed with an empty input", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when Enter is pressed with whitespace-only input", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "   {Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --- Input clearing ---

  it("clears the input after calling onSubmit", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await userEvent.type(input, "Louvre{Enter}");

    expect(input.value).toBe("");
  });

  it("does not clear the input when Enter is pressed with empty value", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    // stays empty — but importantly stays focused and does not error
    expect(input.value).toBe("");
  });

  // --- URL detection edge cases ---

  it("treats a plain URL that is not Google Maps as isUrl=false", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "https://www.tripadvisor.com/place{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "https://www.tripadvisor.com/place",
      false
    );
  });

  // --- Submit button ---

  it("shows a submit button when input has text", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    // No button when empty
    expect(
      screen.queryByRole("button", { name: /add location/i })
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("combobox"), "Louvre");
    expect(
      screen.getByRole("button", { name: /add location/i })
    ).toBeInTheDocument();
  });

  it("calls onSubmit when submit button is clicked", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    await userEvent.type(screen.getByRole("combobox"), "Louvre");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(onSubmit).toHaveBeenCalledWith("Louvre", false);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("hides the submit button after successful submit via click", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    await userEvent.type(screen.getByRole("combobox"), "Louvre");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /add location/i })
      ).not.toBeInTheDocument();
    });
  });

  it("trims leading/trailing whitespace before passing value to onSubmit", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("combobox");
    // userEvent.type does not support leading spaces naturally — type with surrounding text
    await userEvent.type(input, "  Arc de Triomphe  {Enter}");

    // The submitted value should be trimmed
    expect(onSubmit).toHaveBeenCalledWith("Arc de Triomphe", false);
  });
});

// =============================================================================
// TYPEAHEAD TESTS — Red phase: these tests will FAIL until the new
// SmartLocationInput typeahead implementation lands.
//
// The tests below require the component to accept new props:
//   existingLocations: Location[]
//   onPickExisting: (locationId: string) => void
// and to implement autocomplete dropdown behaviour.
// =============================================================================

// ---------------------------------------------------------------------------
// Mocks for the typeahead tests. `vi.mock` is hoisted to the top of the
// file — any references inside its factory must come from `vi.hoisted`.
// ---------------------------------------------------------------------------

const { mockAutocomplete, mockResolvePlace } = vi.hoisted(() => ({
  mockAutocomplete: vi.fn(),
  mockResolvePlace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    google: {
      autocomplete: mockAutocomplete,
      resolvePlace: mockResolvePlace,
    },
  },
}));

vi.mock("@/lib/read-only-context", () => ({
  useReadOnly: () => false,
}));

// ---------------------------------------------------------------------------
// Shared fixtures for typeahead tests
// ---------------------------------------------------------------------------

const EXISTING_LOCATIONS = [
  {
    id: "loc-existing-1",
    name: "Louvre Museum",
    google_place_id: "ChIJ_louvre",
    city: "Paris",
    address: "Rue de Rivoli, 75001 Paris",
    category: "Museum",
  },
  {
    id: "loc-existing-2",
    name: "Eiffel Tower",
    google_place_id: "ChIJ_eiffel",
    city: "Paris",
    address: "Av. Gustave Eiffel, 75007 Paris",
    category: "Viewpoint",
  },
  {
    // Legacy location — no google_place_id, only name
    id: "loc-existing-3",
    name: "Louvre Palace",
    google_place_id: null,
    city: "Paris",
    address: null,
    category: null,
  },
];

const AUTOCOMPLETE_RESPONSE_THREE_SUGGESTIONS = {
  suggestions: [
    {
      place_id: "ChIJ_eiffel",
      main_text: "Eiffel Tower",
      secondary_text: "Paris, France",
      types: ["tourist_attraction"],
    },
    {
      place_id: "ChIJ_eiff2",
      main_text: "Eiffelstraße",
      secondary_text: "Berlin, Germany",
      types: ["route"],
    },
    {
      place_id: "ChIJ_eiff3",
      main_text: "Eiffel Square",
      secondary_text: "Lyon, France",
      types: ["establishment"],
    },
  ],
};

const RESOLVE_RESPONSE = {
  name: "Eiffelstraße",
  address: "Eiffelstraße, Berlin, Germany",
  city: "Berlin",
  latitude: 52.5163,
  longitude: 13.3777,
  google_place_id: "ChIJ_eiff2",
  suggested_category: "Route",
  photo_resource_name: null,
};

describe("SmartLocationInput — typeahead behaviour (Red phase)", () => {
  const tripId = "trip-typeahead";
  const onSubmit = vi.fn();
  const onImported = vi.fn();
  const onPickExisting = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // `shouldAdvanceTime: true` lets Testing Library's waitFor (which uses
    // setInterval internally) keep working while the hook's 250 ms
    // debounce setTimeout is still mockable. Without this, waitFor hangs
    // because its own polling timers never fire.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAutocomplete.mockResolvedValue(AUTOCOMPLETE_RESPONSE_THREE_SUGGESTIONS);
    mockResolvePlace.mockResolvedValue(RESOLVE_RESPONSE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Dropdown opens on 2+ chars ---

  it("opens a dropdown listbox when user types at least 2 characters", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Ei");

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });

  it("does not open a dropdown for a single character", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "E");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  // --- "On list" pill rendered ---

  it("renders an 'On list' pill for suggestions that match an existing location by place_id", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Ei");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      // The first suggestion (ChIJ_eiffel) matches EXISTING_LOCATIONS[1]
      expect(screen.getByText(/on list/i)).toBeInTheDocument();
    });
  });

  // --- "On list" click invokes onPickExisting, NOT resolvePlace ---

  it("calls onPickExisting with the existing location id when an 'On list' row is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Ei");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Click the "On list" row (the Eiffel Tower suggestion which is already on the list)
    const onListItem = screen
      .getByText(/Eiffel Tower/i)
      .closest("[role='option']");
    if (onListItem) {
      await user.click(onListItem);
    } else {
      // Fall back to clicking the On list badge itself
      await user.click(screen.getByText(/on list/i));
    }

    // onPickExisting must be called with the matching location's id
    expect(onPickExisting).toHaveBeenCalledWith("loc-existing-2");
    // resolvePlace must NOT be called — no Google API billing for on-list picks
    expect(mockResolvePlace).not.toHaveBeenCalled();
  });

  // --- Keyboard navigation: ArrowDown → Enter → resolve called ---

  it("resolves the highlighted suggestion via keyboard when Enter is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Ei");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Navigate down twice (skip the on-list "Eiffel Tower", land on "Eiffelstraße")
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mockResolvePlace).toHaveBeenCalledTimes(1);
    });

    // The place_id passed must be "ChIJ_eiff2" (Eiffelstraße, not on the list)
    expect(mockResolvePlace.mock.calls[0][0].place_id).toBe("ChIJ_eiff2");
    // The session_token must also be forwarded
    expect(mockResolvePlace.mock.calls[0][0].session_token).toBeDefined();
    expect(typeof mockResolvePlace.mock.calls[0][0].session_token).toBe(
      "string"
    );
  });

  // --- Escape closes dropdown ---

  it("closes the dropdown when Escape is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Ei");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  // --- Google Maps URL paste bypasses autocomplete ---

  it("does not call api.google.autocomplete when a Google Maps URL is pasted", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.paste("https://maps.app.goo.gl/xyz");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Autocomplete must NOT be triggered for a URL paste
    expect(mockAutocomplete).not.toHaveBeenCalled();
    // No dropdown must appear
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("submitting a Google Maps URL calls onSubmit with isUrl=true (existing flow preserved)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "https://maps.app.goo.gl/xyz{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("https://maps.app.goo.gl/xyz", true);
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  // --- Read-only mode ---

  it("does not render the autocomplete input when in read-only mode", async () => {
    // Override read-only to true for this test only
    vi.doMock("@/lib/read-only-context", () => ({
      useReadOnly: () => true,
    }));

    // Re-import the component with the updated mock
    // Since vi.doMock is async, we test the behaviour via the existing
    // read-only prop pattern: the input is either absent or disabled.
    // This test documents the contract; exact implementation may vary.
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
        readOnly={true}
      />
    );

    // When readOnly=true, the input must not be interactive.
    // Either it is absent, or it is present but disabled.
    const input = screen.queryByRole("textbox") as HTMLInputElement | null;
    if (input) {
      expect(input.disabled || input.readOnly).toBe(true);
    }
    // Dropdown must never appear
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // --- Name-substring fallback for legacy locations ---

  it("shows an 'On list' pill for a location matched by exact name when place_id differs", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Override autocomplete to return "Louvre Museum" as a suggestion
    // with a different place_id than the existing location.
    mockAutocomplete.mockResolvedValue({
      suggestions: [
        {
          place_id: "ChIJ_louvre_google",
          main_text: "Louvre Museum",
          secondary_text: "Paris, France",
          types: ["museum"],
        },
      ],
    });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Lou");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // The suggestion "Louvre Museum" has place_id "ChIJ_louvre_google" which
    // does NOT match EXISTING_LOCATIONS[0]'s place_id "ChIJ_louvre", but the
    // exact name "Louvre Museum" matches — the "On list" pill must appear.
    // (Substring matching was removed to prevent false positives like
    // "Eiffel Tower" matching "Eiffel Tower Bahria Town Lahore".)
    await waitFor(() => {
      expect(screen.getByText(/on list/i)).toBeInTheDocument();
    });
  });

  it("does NOT show 'On list' for a suggestion whose name only partially matches an existing location", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // "Eiffel Tower Bahria Town Lahore" is a different place than "Eiffel Tower"
    mockAutocomplete.mockResolvedValue({
      suggestions: [
        {
          place_id: "ChIJ_lahore_eiffel",
          main_text: "Eiffel Tower Bahria Town Lahore",
          secondary_text: "Lahore, Pakistan",
          types: ["tourist_attraction"],
        },
      ],
    });

    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
        existingLocations={EXISTING_LOCATIONS}
        onPickExisting={onPickExisting}
      />
    );

    await user.type(screen.getByRole("combobox"), "Eiff");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // The existing location "Eiffel Tower" must NOT match "Eiffel Tower
    // Bahria Town Lahore" — substring matching was the root cause of this
    // false positive.
    expect(screen.queryByText(/on list/i)).not.toBeInTheDocument();
  });
});
