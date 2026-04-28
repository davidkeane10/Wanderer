// Module-level singleton used to pass a map-picked pin back from
// pick-spot-location → submit-spot without needing shared context.

let _coords: { latitude: number; longitude: number } | null = null;

export function setPickedLocation(coords: { latitude: number; longitude: number } | null) {
  _coords = coords;
}

export function getPickedLocation() {
  return _coords;
}

export function clearPickedLocation() {
  _coords = null;
}
