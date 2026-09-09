export type MockPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6371000;

// Offsetting purely along latitude moves the point straight along a
// meridian, so the resulting distance from `origin` is exact — same
// technique used in __tests__/distanceUtils.test.ts.
function offsetNorthByMeters(
  origin: { latitude: number; longitude: number },
  meters: number,
): { latitude: number; longitude: number } {
  const deltaLatDegrees = (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  return { latitude: origin.latitude + deltaLatDegrees, longitude: origin.longitude };
}

/**
 * Dev-only test fixtures: points at known distances from `origin` (0m, 15m,
 * 30m, 50m, 100m, 150m). Lets the full threshold + save + UI-update pipeline
 * be exercised from HomeScreen's TEST MODE button without needing to
 * actually walk around outside.
 */
export function buildMockTestPoints(origin: { latitude: number; longitude: number }): MockPoint[] {
  return [0, 15, 30, 50, 100, 150].map(meters => ({
    label: `${meters}m`,
    ...offsetNorthByMeters(origin, meters),
  }));
}
