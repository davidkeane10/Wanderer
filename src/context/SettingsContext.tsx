import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useReducer } from "react";

export type Units = "metric" | "imperial";

export interface SettingsState {
  radiusKm: number;
  units: Units;
}

type SettingsAction =
  | { type: "SET_RADIUS"; payload: number }
  | { type: "SET_UNITS"; payload: Units };

const STORAGE_KEY = "@sidequests/settings";

const DEFAULT: SettingsState = {
  radiusKm: 80, // 50 miles
  units: "imperial",
};

function reducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "SET_RADIUS":
      return { ...state, radiusKm: action.payload };
    case "SET_UNITS":
      return { ...state, units: action.payload };
    default:
      return state;
  }
}

interface SettingsContextValue {
  settings: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, dispatch] = useReducer(reducer, DEFAULT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed: Partial<SettingsState> = JSON.parse(stored);
          if (parsed.radiusKm) dispatch({ type: "SET_RADIUS", payload: parsed.radiusKm });
          if (parsed.units) dispatch({ type: "SET_UNITS", payload: parsed.units });
        } catch {
          // ignore malformed
        }
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
