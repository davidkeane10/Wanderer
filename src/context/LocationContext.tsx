import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
} from "react";
import type { LocationAction, LocationState } from "../types/location";

const STORAGE_KEY = "@sidequests/location";

const initialState: LocationState = {
  coords: null,
  cityName: null,
  regionName: null,
  countryName: null,
  isManual: false,
  permissionStatus: "undetermined",
  isLoading: false,
};

function locationReducer(state: LocationState, action: LocationAction): LocationState {
  switch (action.type) {
    case "SET_GPS_LOCATION":
      return {
        ...state,
        coords: action.payload.coords,
        cityName: action.payload.cityName,
        regionName: action.payload.regionName,
        countryName: action.payload.countryName,
        isManual: false,
        isLoading: false,
        permissionStatus: "granted",
      };
    case "SET_MANUAL_LOCATION":
      return {
        ...state,
        coords: action.payload.coords,
        cityName: action.payload.cityName,
        regionName: action.payload.regionName,
        countryName: action.payload.countryName,
        isManual: true,
        isLoading: false,
      };
    case "SET_PERMISSION":
      return { ...state, permissionStatus: action.payload };
    case "CLEAR_LOCATION":
      return {
        ...initialState,
        permissionStatus: state.permissionStatus,
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

interface LocationContextValue {
  location: LocationState;
  dispatch: React.Dispatch<LocationAction>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, dispatch] = useReducer(locationReducer, initialState);

  // Load persisted location on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed: LocationState = JSON.parse(stored);
          if (parsed.coords) {
            dispatch({
              type: parsed.isManual ? "SET_MANUAL_LOCATION" : "SET_GPS_LOCATION",
              payload: {
                coords: parsed.coords,
                cityName: parsed.cityName ?? "",
                regionName: parsed.regionName ?? "",
                countryName: parsed.countryName ?? "",
              },
            });
          }
        } catch {
          // ignore malformed storage
        }
      }
    });
  }, []);

  // Persist location changes
  useEffect(() => {
    if (location.coords) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, [location]);

  return (
    <LocationContext.Provider value={{ location, dispatch }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
