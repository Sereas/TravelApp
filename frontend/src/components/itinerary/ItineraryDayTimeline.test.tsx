import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryDayTimeline } from "./ItineraryDayTimeline";

describe("ItineraryDayTimeline", () => {
  it("renders empty state when there are no locations", () => {
    render(
      <ItineraryDayTimeline
        sorted={[]}
        locRouteMap={new Map()}
        expandedId={null}
        dragId={null}
        dropId={null}
        isPickMode={false}
        pickIds={[]}
        tpOpen={null}
        tpTrigger={{ current: null }}
        currentOptionId="opt-1"
        dayId="day-1"
        calculatingRouteId={null}
        onTogglePick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDropLeave={vi.fn()}
        onToggleExpanded={vi.fn()}
        onInspectLocation={vi.fn()}
        onToggleTimePicker={vi.fn()}
        onRemoveLocation={vi.fn()}
        onDropAtEnd={vi.fn()}
      />
    );

    expect(screen.getByText(/No stops planned yet/i)).toBeInTheDocument();
  });

  it("shows end drop zone during drag and forwards the drop event", () => {
    const onDropAtEnd = vi.fn();
    const onDropLeave = vi.fn();

    render(
      <ItineraryDayTimeline
        sorted={[
          {
            id: "ol-1",
            location_id: "loc-1",
            sort_order: 0,
            time_period: "morning",
            location: {
              id: "loc-1",
              name: "Eiffel Tower",
              city: "Paris",
              address: "Champ de Mars",
              google_link: null,
              category: "viewpoint",
              note: null,
              working_hours: null,
              useful_link: null,
              requires_booking: null,
              latitude: null,
              longitude: null,
              image_url: null,
              user_image_url: null,
              user_image_crop: null,
              attribution_name: null,
              attribution_uri: null,
            },
          },
        ]}
        locRouteMap={new Map()}
        expandedId={null}
        dragId="ol-1"
        dropId="__end__"
        isPickMode={false}
        pickIds={[]}
        tpOpen={null}
        tpTrigger={{ current: null }}
        currentOptionId="opt-1"
        dayId="day-1"
        calculatingRouteId={null}
        onTogglePick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDropLeave={onDropLeave}
        onToggleExpanded={vi.fn()}
        onInspectLocation={vi.fn()}
        onToggleTimePicker={vi.fn()}
        onRemoveLocation={vi.fn()}
        onDropAtEnd={onDropAtEnd}
      />
    );

    const dropZone = screen.getByTestId("timeline-end-drop-zone");
    fireEvent.dragLeave(dropZone);
    expect(onDropLeave).toHaveBeenCalled();

    fireEvent.drop(dropZone);
    expect(onDropAtEnd).toHaveBeenCalled();
  });

  it("groups stops into time-of-day sections", () => {
    render(
      <ItineraryDayTimeline
        sorted={[
          {
            id: "ol-1",
            location_id: "loc-1",
            sort_order: 0,
            time_period: "morning",
            location: {
              id: "loc-1",
              name: "Cafe de Flore",
              city: "Paris",
              address: null,
              google_link: null,
              category: "cafe",
              note: null,
              working_hours: null,
              useful_link: null,
              requires_booking: null,
              latitude: null,
              longitude: null,
              image_url: null,
              user_image_url: null,
              user_image_crop: null,
              attribution_name: null,
              attribution_uri: null,
            },
          },
          {
            id: "ol-2",
            location_id: "loc-2",
            sort_order: 1,
            time_period: "evening",
            location: {
              id: "loc-2",
              name: "Seine Cruise",
              city: "Paris",
              address: null,
              google_link: null,
              category: "activity",
              note: null,
              working_hours: null,
              useful_link: null,
              requires_booking: null,
              latitude: null,
              longitude: null,
              image_url: null,
              user_image_url: null,
              user_image_crop: null,
              attribution_name: null,
              attribution_uri: null,
            },
          },
        ]}
        locRouteMap={new Map()}
        expandedId={null}
        dragId={null}
        dropId={null}
        isPickMode={false}
        pickIds={[]}
        tpOpen={null}
        tpTrigger={{ current: null }}
        currentOptionId="opt-1"
        dayId="day-1"
        calculatingRouteId={null}
        onTogglePick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onDropLeave={vi.fn()}
        onToggleExpanded={vi.fn()}
        onInspectLocation={vi.fn()}
        onToggleTimePicker={vi.fn()}
        onRemoveLocation={vi.fn()}
        onDropAtEnd={vi.fn()}
      />
    );

    const morningSection = screen.getByRole("region", {
      name: /morning stops/i,
    });
    const eveningSection = screen.getByRole("region", {
      name: /evening stops/i,
    });

    expect(
      within(morningSection).getByText("Cafe de Flore")
    ).toBeInTheDocument();
    expect(
      within(eveningSection).getByText("Seine Cruise")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /afternoon stops/i })
    ).not.toBeInTheDocument();
  });
});
