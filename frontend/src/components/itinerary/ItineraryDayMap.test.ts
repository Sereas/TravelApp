/// <reference types="vitest/globals" />
import { decodePolyline } from "./ItineraryDayMap";

describe("decodePolyline", () => {
  it("decodes a simple Google-encoded polyline", () => {
    // Encoding for two points: (38.5, -120.2) and (40.7, -120.95)
    // Standard test case from Google's polyline algorithm documentation
    const encoded = "_p~iF~ps|U_ulLnnqC";
    const coords = decodePolyline(encoded);
    expect(coords).toHaveLength(2);
    // decodePolyline returns [lng, lat] for GeoJSON
    expect(coords[0][1]).toBeCloseTo(38.5, 4);
    expect(coords[0][0]).toBeCloseTo(-120.2, 4);
    expect(coords[1][1]).toBeCloseTo(40.7, 4);
    expect(coords[1][0]).toBeCloseTo(-120.95, 4);
  });

  it("returns empty array for empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("decodes a single point", () => {
    // Encoding for a single point (0, 0) is "??"
    const coords = decodePolyline("??");
    expect(coords).toHaveLength(1);
    expect(coords[0][0]).toBeCloseTo(0, 4);
    expect(coords[0][1]).toBeCloseTo(0, 4);
  });

  it("decodes a multi-point polyline correctly", () => {
    // Use the Google reference polyline and verify point count and deltas
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const coords = decodePolyline(encoded);
    expect(coords).toHaveLength(3);
    // Third point: verify accumulated deltas work
    expect(coords[2][1]).toBeCloseTo(43.252, 3);
    expect(coords[2][0]).toBeCloseTo(-126.453, 3);
  });
});
