export type LatLng = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function getDistanceInMeters(point1: LatLng, point2: LatLng): number {
  const lat1 = toRadians(point1.latitude);
  const lat2 = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLng = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function shouldSaveLocation(
  lastSaved: LatLng | null,
  current: LatLng,
  thresholdMeters: number = 30,
): boolean {
  if (!lastSaved) {
    return true;
  }
  return getDistanceInMeters(lastSaved, current) >= thresholdMeters;
}
