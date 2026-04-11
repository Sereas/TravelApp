/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItineraryLocationRow } from "./ItineraryLocationRow";

const optionLocation = {
  id: "ol-1",
  location_id: "loc-1",
  sort_order: 0,
  time_period: "morning",
  location: {
    id: "loc-1",
    name: "Eiffel Tower",
    city: "Paris",
    address: "Champ de Mars",
    google_link: "https://maps.google.com",
    category: "Viewpoint",
    note: "Go at sunset",
    working_hours: "9:00-23:00",
    requires_booking: "yes",
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
};

function renderRow(
  overrides: Partial<React.ComponentProps<typeof ItineraryLocationRow>> = {}
) {
  const props = {
    optionLocation,
    expanded: false,
    isDrag: false,
    isDrop: false,
    isPickMode: false,
    picking: false,
    pickSeq: 0,
    routeInfos: [],
    topConnectorHex: null,
    bottomConnectorHex: null,
    timePickerOpenId: null,
    tpTriggerRef: { current: null },
    currentOptionId: "opt-1",
    dayId: "day-1",
    calculatingRouteId: null,
    onTogglePick: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDropLeave: vi.fn(),
    onToggleExpanded: vi.fn(),
    onToggleTimePicker: vi.fn(),
    onRemoveLocation: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<ItineraryLocationRow {...props} />),
    props,
  };
}

describe("ItineraryLocationRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toggles expanded details and time picker actions", async () => {
    const { props } = renderRow();

    const expandBtn = screen.getByRole("button", { expanded: false });
    await userEvent.click(expandBtn);
    expect(props.onToggleExpanded).toHaveBeenCalledWith("ol-1");

    await userEvent.click(
      screen.getByRole("button", { name: /time: morning/i })
    );
    expect(props.onToggleTimePicker).toHaveBeenCalledWith("ol-1");
  });

  it("removes a location from the current option", async () => {
    const { props } = renderRow();

    await userEvent.click(
      screen.getByRole("button", { name: /remove eiffel tower/i })
    );
    expect(props.onRemoveLocation).toHaveBeenCalledWith(
      "day-1",
      "opt-1",
      "ol-1"
    );
  });

  it("shows extra details when expanded", () => {
    renderRow({ expanded: true });

    expect(screen.getByText(/champ de mars/i)).toBeInTheDocument();
    expect(screen.getByText(/9:00-23:00/)).toBeInTheDocument();
  });

  it("renders a location image when one is available", () => {
    renderRow({
      optionLocation: {
        ...optionLocation,
        id: "ol-1",
        location: {
          ...optionLocation.location,
          image_url: "https://images.example/eiffel.jpg",
        },
      },
    });

    expect(screen.getByRole("img", { name: /eiffel tower/i })).toHaveAttribute(
      "src",
      "https://images.example/eiffel.jpg"
    );
  });

  it("hides note in collapsed view", () => {
    renderRow();

    expect(screen.queryByText(/go at sunset/i)).not.toBeInTheDocument();
  });
});
