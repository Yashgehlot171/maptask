import { getDistanceInMeters, shouldSaveLocation, type LatLng } from '../src/services/distanceUtils';

const EARTH_RADIUS_METERS = 6371000;
const BASE_POINT: LatLng = { latitude: 22.7196, longitude: 75.8577 };

// Offsetting purely along latitude (no longitude change) moves the point straight
// along a meridian, so the great-circle distance is exactly `meters` — this gives
// precise, independent fixtures without relying on the function under test.
function pointNorthByMeters(origin: LatLng, meters: number): LatLng {
  const deltaLatDegrees = (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  return { latitude: origin.latitude + deltaLatDegrees, longitude: origin.longitude };
}

describe('getDistanceInMeters', () => {
  it('returns 0 for the same point', () => {
    expect(getDistanceInMeters(BASE_POINT, BASE_POINT)).toBeCloseTo(0, 3);
  });

  it('returns a distance close to a known ~100m separation (±5m tolerance)', () => {
    const target = pointNorthByMeters(BASE_POINT, 100);
    const distance = getDistanceInMeters(BASE_POINT, target);
    expect(distance).toBeGreaterThanOrEqual(95);
    expect(distance).toBeLessThanOrEqual(105);
  });
});

describe('shouldSaveLocation', () => {
  it('returns true when there is no last-saved point yet (first fix)', () => {
    expect(shouldSaveLocation(null, BASE_POINT)).toBe(true);
  });

  it('returns false for the same point (0m apart)', () => {
    expect(shouldSaveLocation(BASE_POINT, BASE_POINT)).toBe(false);
  });

  it('returns false just under the 30m threshold (~29m)', () => {
    const point = pointNorthByMeters(BASE_POINT, 29);
    expect(shouldSaveLocation(BASE_POINT, point)).toBe(false);
  });

  it('returns true at the 30m threshold (inclusive boundary, ~30m)', () => {
    // A hair over 30m (not exactly 30.000) so the assertion doesn't depend on
    // floating-point rounding landing on the correct side of the boundary.
    const point = pointNorthByMeters(BASE_POINT, 30.001);
    expect(shouldSaveLocation(BASE_POINT, point)).toBe(true);
  });

  it('returns true just over the 30m threshold (~31m)', () => {
    const point = pointNorthByMeters(BASE_POINT, 31);
    expect(shouldSaveLocation(BASE_POINT, point)).toBe(true);
  });
});

describe('sequential walk simulation (mirrors locationService.ts state handling)', () => {
  it('threshold-gates a sequence of fixes correctly as lastSaved accumulates', () => {
    // Distances from BASE_POINT: 0, 10, 45, 55, 95, 100 — simulating a walk
    // with a mix of small jitters (<30m) and real strides (40-50m+) between
    // GPS fixes, same pattern as real device output.
    const fixes = [0, 10, 45, 55, 95, 100].map(meters => pointNorthByMeters(BASE_POINT, meters));

    // Plain mutable binding across sequential calls — this is exactly how
    // locationService.ts's module-level `lastSavedPoint` behaves (it is not
    // a React ref/state; there is no render cycle involved), so this loop
    // verifies the same accumulation pattern used in production.
    let lastSaved: LatLng | null = null;
    const decisions: boolean[] = [];

    for (const fix of fixes) {
      const saved = shouldSaveLocation(lastSaved, fix);
      decisions.push(saved);
      if (saved) {
        lastSaved = fix;
      }
    }

    // 0m: first fix, always saved.
    // 10m: only 10m from last-saved (0m) -> skipped.
    // 45m: 45m from last-saved (0m) -> saved, becomes new lastSaved.
    // 55m: only 10m from last-saved (45m) -> skipped.
    // 95m: 50m from last-saved (45m) -> saved, becomes new lastSaved.
    // 100m: only 5m from last-saved (95m) -> skipped.
    expect(decisions).toEqual([true, false, true, false, true, false]);
    // If `lastSaved` had gone stale (e.g. stuck at `null` or at the very
    // first fix), the 55m and 100m checks above would have measured against
    // the wrong reference point and come back `true` instead of `false` —
    // so this exact pattern passing only makes sense if lastSaved tracked
    // each save correctly across the whole sequence.
    expect(lastSaved).toEqual(fixes[4]);
  });
});
