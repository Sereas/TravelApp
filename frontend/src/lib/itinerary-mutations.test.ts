/**
 * Tests for pure itinerary mutation helpers.
 * All functions must be immutable — they return new objects without mutating input.
 */
import { describe, expect, it } from "vitest";

import {
  addOptionLocation,
  locationSummaryFromLocation,
  locationSummaryPlaceholder,
  mutateDay,
  mutateOption,
  mutateOptionLocation,
  removeOptionLocation,
} from "./itinerary-mutations";
import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryOptionLocation,
  ItineraryResponse,
  Location,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLocation(id: string): ItineraryOptionLocation {
  return {
    id,
    location_id: `loc-${id}`,
    sort_order: 0,
    time_period: "morning",
    location: {
      id: `loc-${id}`,
      name: `Location ${id}`,
      city: null,
      address: null,
      google_link: null,
      category: null,
      note: null,
      working_hours: null,
      requires_booking: null,
      latitude: null,
      longitude: null,
      image_url: null,
      user_image_url: null,
      attribution_name: null,
      attribution_uri: null,
    },
  };
}

function makeOption(id: string, locations: ItineraryOptionLocation[] = []): ItineraryOption {
  return {
    id,
    option_index: 1,
    starting_city: null,
    ending_city: null,
    created_by: null,
    locations,
    routes: [],
  };
}

function makeDay(id: string, options: ItineraryOption[] = []): ItineraryDay {
  return {
    id,
    date: null,
    sort_order: 0,
    active_option_id: null,
    options,
  };
}

function makeItinerary(days: ItineraryDay[]): ItineraryResponse {
  return { days };
}

// ---------------------------------------------------------------------------
// mutateDay
// ---------------------------------------------------------------------------

describe("mutateDay", () => {
  it("returns a new itinerary with the target day updated", () => {
    const day1 = makeDay("day-1");
    const day2 = makeDay("day-2");
    const itinerary = makeItinerary([day1, day2]);

    const result = mutateDay(itinerary, "day-1", (d) => ({
      ...d,
      date: "2026-01-01",
    }));

    expect(result.days[0].date).toBe("2026-01-01");
    expect(result.days[1]).toBe(day2); // unchanged ref preserved
  });

  it("does not mutate the input itinerary", () => {
    const day = makeDay("day-1");
    const itinerary = makeItinerary([day]);

    mutateDay(itinerary, "day-1", (d) => ({ ...d, date: "2026-01-01" }));

    expect(itinerary.days[0].date).toBeNull();
  });

  it("preserves reference for unchanged days", () => {
    const day1 = makeDay("day-1");
    const day2 = makeDay("day-2");
    const itinerary = makeItinerary([day1, day2]);

    const result = mutateDay(itinerary, "day-1", (d) => ({ ...d, date: "2026-01-01" }));

    expect(result.days[1]).toBe(day2);
  });

  it("returns input unchanged when dayId is not found", () => {
    const day = makeDay("day-1");
    const itinerary = makeItinerary([day]);

    const result = mutateDay(itinerary, "nonexistent", (d) => ({
      ...d,
      date: "2026-01-01",
    }));

    // Same structure, no day modified
    expect(result.days[0].date).toBeNull();
  });

  it("handles empty days array", () => {
    const itinerary = makeItinerary([]);
    const result = mutateDay(itinerary, "day-1", (d) => ({ ...d, date: "2026-01-01" }));
    expect(result.days).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// mutateOption
// ---------------------------------------------------------------------------

describe("mutateOption", () => {
  it("returns a new itinerary with the target option updated", () => {
    const opt = makeOption("opt-1");
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOption(itinerary, "day-1", "opt-1", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(result.days[0].options[0].starting_city).toBe("Tokyo");
  });

  it("does not mutate the input itinerary", () => {
    const opt = makeOption("opt-1");
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    mutateOption(itinerary, "day-1", "opt-1", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(itinerary.days[0].options[0].starting_city).toBeNull();
  });

  it("preserves reference for unchanged options in the same day", () => {
    const opt1 = makeOption("opt-1");
    const opt2 = makeOption("opt-2");
    const day = makeDay("day-1", [opt1, opt2]);
    const itinerary = makeItinerary([day]);

    const result = mutateOption(itinerary, "day-1", "opt-1", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(result.days[0].options[1]).toBe(opt2);
  });

  it("preserves reference for unchanged days", () => {
    const day1 = makeDay("day-1", [makeOption("opt-1")]);
    const day2 = makeDay("day-2", [makeOption("opt-2")]);
    const itinerary = makeItinerary([day1, day2]);

    const result = mutateOption(itinerary, "day-1", "opt-1", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(result.days[1]).toBe(day2);
  });

  it("returns input unchanged when dayId is not found", () => {
    const opt = makeOption("opt-1");
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOption(itinerary, "nonexistent", "opt-1", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(result.days[0].options[0].starting_city).toBeNull();
  });

  it("returns input unchanged when optionId is not found", () => {
    const opt = makeOption("opt-1");
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOption(itinerary, "day-1", "nonexistent", (o) => ({
      ...o,
      starting_city: "Tokyo",
    }));

    expect(result.days[0].options[0].starting_city).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mutateOptionLocation
// ---------------------------------------------------------------------------

describe("mutateOptionLocation", () => {
  it("returns a new itinerary with the target option-location updated", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOptionLocation(itinerary, "day-1", "opt-1", "ol-1", (l) => ({
      ...l,
      time_period: "evening",
    }));

    expect(result.days[0].options[0].locations[0].time_period).toBe("evening");
  });

  it("does not mutate the input itinerary", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    mutateOptionLocation(itinerary, "day-1", "opt-1", "ol-1", (l) => ({
      ...l,
      time_period: "evening",
    }));

    expect(itinerary.days[0].options[0].locations[0].time_period).toBe("morning");
  });

  it("preserves reference for unchanged locations", () => {
    const ol1 = makeLocation("ol-1");
    const ol2 = makeLocation("ol-2");
    const opt = makeOption("opt-1", [ol1, ol2]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOptionLocation(itinerary, "day-1", "opt-1", "ol-1", (l) => ({
      ...l,
      time_period: "evening",
    }));

    expect(result.days[0].options[0].locations[1]).toBe(ol2);
  });

  it("returns input unchanged when olId is not found", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOptionLocation(itinerary, "day-1", "opt-1", "nonexistent", (l) => ({
      ...l,
      time_period: "evening",
    }));

    expect(result.days[0].options[0].locations[0].time_period).toBe("morning");
  });

  it("returns input unchanged when day/option not found", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = mutateOptionLocation(
      itinerary,
      "nonexistent-day",
      "opt-1",
      "ol-1",
      (l) => ({ ...l, time_period: "evening" })
    );

    expect(result.days[0].options[0].locations[0].time_period).toBe("morning");
  });
});

// ---------------------------------------------------------------------------
// removeOptionLocation
// ---------------------------------------------------------------------------

describe("removeOptionLocation", () => {
  it("removes the specified option-location from the option", () => {
    const ol1 = makeLocation("ol-1");
    const ol2 = makeLocation("ol-2");
    const opt = makeOption("opt-1", [ol1, ol2]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = removeOptionLocation(itinerary, "day-1", "opt-1", "ol-1");

    expect(result.days[0].options[0].locations).toHaveLength(1);
    expect(result.days[0].options[0].locations[0].id).toBe("ol-2");
  });

  it("does not mutate the input itinerary", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    removeOptionLocation(itinerary, "day-1", "opt-1", "ol-1");

    expect(itinerary.days[0].options[0].locations).toHaveLength(1);
  });

  it("removed olId is absent from result", () => {
    const ol1 = makeLocation("ol-1");
    const ol2 = makeLocation("ol-2");
    const ol3 = makeLocation("ol-3");
    const opt = makeOption("opt-1", [ol1, ol2, ol3]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = removeOptionLocation(itinerary, "day-1", "opt-1", "ol-2");

    const ids = result.days[0].options[0].locations.map((l) => l.id);
    expect(ids).not.toContain("ol-2");
    expect(ids).toContain("ol-1");
    expect(ids).toContain("ol-3");
  });

  it("returns input unchanged when olId not found (no-op)", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = removeOptionLocation(itinerary, "day-1", "opt-1", "nonexistent");

    expect(result.days[0].options[0].locations).toHaveLength(1);
  });

  it("returns itinerary unchanged when day not found", () => {
    const ol = makeLocation("ol-1");
    const opt = makeOption("opt-1", [ol]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = removeOptionLocation(itinerary, "nonexistent", "opt-1", "ol-1");

    expect(result.days[0].options[0].locations).toHaveLength(1);
  });

  it("handles empty locations array gracefully", () => {
    const opt = makeOption("opt-1", []);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = removeOptionLocation(itinerary, "day-1", "opt-1", "ol-1");

    expect(result.days[0].options[0].locations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addOptionLocation
// ---------------------------------------------------------------------------

describe("addOptionLocation", () => {
  it("appends the new location to the target option", () => {
    const ol1 = makeLocation("ol-1");
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", [ol1]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = addOptionLocation(itinerary, "day-1", "opt-1", newOl);

    expect(result.days[0].options[0].locations).toHaveLength(2);
    expect(result.days[0].options[0].locations[1].id).toBe("ol-new");
  });

  it("does not mutate the input itinerary", () => {
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", []);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    addOptionLocation(itinerary, "day-1", "opt-1", newOl);

    expect(itinerary.days[0].options[0].locations).toHaveLength(0);
  });

  it("new location appears in option's locations", () => {
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", []);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = addOptionLocation(itinerary, "day-1", "opt-1", newOl);

    expect(result.days[0].options[0].locations).toContainEqual(newOl);
  });

  it("preserves existing locations when adding new one", () => {
    const ol1 = makeLocation("ol-1");
    const ol2 = makeLocation("ol-2");
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", [ol1, ol2]);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = addOptionLocation(itinerary, "day-1", "opt-1", newOl);

    expect(result.days[0].options[0].locations).toHaveLength(3);
    expect(result.days[0].options[0].locations[0]).toBe(ol1);
    expect(result.days[0].options[0].locations[1]).toBe(ol2);
  });

  it("returns input unchanged when day not found", () => {
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", []);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = addOptionLocation(itinerary, "nonexistent", "opt-1", newOl);

    expect(result.days[0].options[0].locations).toHaveLength(0);
  });

  it("returns input unchanged when option not found", () => {
    const newOl = makeLocation("ol-new");
    const opt = makeOption("opt-1", []);
    const day = makeDay("day-1", [opt]);
    const itinerary = makeItinerary([day]);

    const result = addOptionLocation(itinerary, "day-1", "nonexistent", newOl);

    expect(result.days[0].options[0].locations).toHaveLength(0);
  });

  it("preserves references for unchanged days and options", () => {
    const newOl = makeLocation("ol-new");
    const opt1 = makeOption("opt-1", []);
    const opt2 = makeOption("opt-2", []);
    const day1 = makeDay("day-1", [opt1, opt2]);
    const day2 = makeDay("day-2", []);
    const itinerary = makeItinerary([day1, day2]);

    const result = addOptionLocation(itinerary, "day-1", "opt-1", newOl);

    expect(result.days[1]).toBe(day2);
    expect(result.days[0].options[1]).toBe(opt2);
  });
});

// ---------------------------------------------------------------------------
// locationSummaryFromLocation
// ---------------------------------------------------------------------------

describe("locationSummaryFromLocation", () => {
  function makeFullLocation(): Location {
    return {
      id: "loc-1",
      name: "Shibuya Crossing",
      city: "Tokyo",
      address: "1-1 Dogenzaka",
      google_link: "https://maps.google.com/",
      google_place_id: "ChIJXXXXXXXXXXX",
      category: "attraction",
      note: "Very busy at night",
      working_hours: "24/7",
      requires_booking: "no",
      latitude: 35.6595,
      longitude: 139.7004,
      image_url: "https://example.com/image.jpg",
      user_image_url: "https://example.com/user.jpg",
      attribution_name: "Photographer",
      attribution_uri: "https://example.com/",
      added_by_user_id: "user-1",
      added_by_email: "user@example.com",
    };
  }

  it("maps all fields from Location to LocationSummary", () => {
    const loc = makeFullLocation();
    const summary = locationSummaryFromLocation(loc);

    expect(summary.id).toBe("loc-1");
    expect(summary.name).toBe("Shibuya Crossing");
    expect(summary.city).toBe("Tokyo");
    expect(summary.address).toBe("1-1 Dogenzaka");
    expect(summary.google_link).toBe("https://maps.google.com/");
    expect(summary.category).toBe("attraction");
    expect(summary.note).toBe("Very busy at night");
    expect(summary.working_hours).toBe("24/7");
    expect(summary.requires_booking).toBe("no");
    expect(summary.latitude).toBe(35.6595);
    expect(summary.longitude).toBe(139.7004);
    expect(summary.image_url).toBe("https://example.com/image.jpg");
    expect(summary.user_image_url).toBe("https://example.com/user.jpg");
    expect(summary.attribution_name).toBe("Photographer");
    expect(summary.attribution_uri).toBe("https://example.com/");
  });

  it("does not include added_by_email, added_by_user_id, or google_place_id in the summary", () => {
    const loc = makeFullLocation();
    const summary = locationSummaryFromLocation(loc);

    expect(summary).not.toHaveProperty("added_by_email");
    expect(summary).not.toHaveProperty("added_by_user_id");
    expect(summary).not.toHaveProperty("google_place_id");
  });

  it("preserves null values from the source location", () => {
    const loc: Location = {
      ...makeFullLocation(),
      city: null,
      address: null,
      latitude: null,
      longitude: null,
    };
    const summary = locationSummaryFromLocation(loc);

    expect(summary.city).toBeNull();
    expect(summary.address).toBeNull();
    expect(summary.latitude).toBeNull();
    expect(summary.longitude).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// locationSummaryPlaceholder
// ---------------------------------------------------------------------------

describe("locationSummaryPlaceholder", () => {
  it("returns a summary with the given id and Loading... name", () => {
    const summary = locationSummaryPlaceholder("loc-xyz");

    expect(summary.id).toBe("loc-xyz");
    expect(summary.name).toBe("Loading...");
  });

  it("returns all nullable fields as null", () => {
    const summary = locationSummaryPlaceholder("any-id");

    expect(summary.city).toBeNull();
    expect(summary.address).toBeNull();
    expect(summary.google_link).toBeNull();
    expect(summary.category).toBeNull();
    expect(summary.note).toBeNull();
    expect(summary.working_hours).toBeNull();
    expect(summary.requires_booking).toBeNull();
    expect(summary.latitude).toBeNull();
    expect(summary.longitude).toBeNull();
    expect(summary.image_url).toBeNull();
    expect(summary.user_image_url).toBeNull();
    expect(summary.attribution_name).toBeNull();
    expect(summary.attribution_uri).toBeNull();
  });
});
