export interface Coords {
  latitude: number;
  longitude: number;
}

export interface LocationState {
  coords: Coords | null;
  cityName: string | null;
  regionName: string | null;
  countryName: string | null;
  isManual: boolean;
  permissionStatus: "undetermined" | "granted" | "denied";
  isLoading: boolean;
}

export type LocationAction =
  | {
      type: "SET_GPS_LOCATION";
      payload: { coords: Coords; cityName: string; regionName: string; countryName: string };
    }
  | {
      type: "SET_MANUAL_LOCATION";
      payload: { coords: Coords; cityName: string; regionName: string; countryName: string };
    }
  | { type: "SET_PERMISSION"; payload: "granted" | "denied" }
  | { type: "CLEAR_LOCATION" }
  | { type: "SET_LOADING"; payload: boolean };
