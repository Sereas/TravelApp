/// <reference types="vitest/globals" />
import { decodePolyline } from "./polylines";

describe("decodePolyline", () => {
  it("decodes a known Google polyline string to [lng, lat] pairs", () => {
    // Encoded polyline for roughly Paris → Eiffel Tower (two-point)
    // Encoding of [[2.3488, 48.8534], [2.2945, 48.8584]] using Google's algorithm.
    // We verify the round-trip: encode known coords → decode → check output shape.
    // Use a known simple encoding: `_p~iF~ps|U_ulLnnqC` = classic polyline example
    // that decodes to [(lat=38.5, lng=-120.2), (lat=40.7, lng=-120.95), (lat=43.252, lng=-126.453)]
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const decoded = decodePolyline(encoded);
    expect(decoded).toHaveLength(3);
    // Each element must be a [lng, lat] pair (numbers)
    for (const pair of decoded) {
      expect(pair).toHaveLength(2);
      expect(typeof pair[0]).toBe("number");
      expect(typeof pair[1]).toBe("number");
    }
    // Verify approximate first coordinate: lat≈38.5, lng≈-120.2
    expect(decoded[0][0]).toBeCloseTo(-120.2, 0);
    expect(decoded[0][1]).toBeCloseTo(38.5, 0);
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("handles a single-point encoding gracefully", () => {
    // Encoding of a single point (lat=0, lng=0): "??"
    // Google encodes 0 as "?" (char 63 → 63 - 63 = 0)
    const decoded = decodePolyline("??");
    expect(decoded).toHaveLength(1);
    expect(decoded[0][0]).toBeCloseTo(0, 5);
    expect(decoded[0][1]).toBeCloseTo(0, 5);
  });
});
