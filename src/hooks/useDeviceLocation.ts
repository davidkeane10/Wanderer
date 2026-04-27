import * as ExpoLocation from "expo-location";
import { useCallback } from "react";
import { Alert } from "react-native";
import { reverseGeocode } from "../services/geocode";
import { useLocation } from "../context/LocationContext";

export function useDeviceLocation() {
  const { location, dispatch } = useLocation();

  const requestLocation = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true });

    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      dispatch({ type: "SET_PERMISSION", payload: "denied" });
      dispatch({ type: "SET_LOADING", payload: false });
      Alert.alert(
        "Location Permission Denied",
        "Please enable location access in your device Settings to use GPS, or search for a city manually."
      );
      return;
    }

    dispatch({ type: "SET_PERMISSION", payload: "granted" });

    try {
      const position = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });

      const geocoded = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude
      );

      dispatch({
        type: "SET_GPS_LOCATION",
        payload: {
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          cityName: geocoded?.cityName ?? "",
          regionName: geocoded?.regionName ?? "",
          countryName: geocoded?.countryName ?? "",
        },
      });
    } catch {
      dispatch({ type: "SET_LOADING", payload: false });
      Alert.alert(
        "Couldn't Get Location",
        "Unable to determine your GPS position. Try searching for your city manually."
      );
    }
  }, [dispatch]);

  return {
    location,
    requestLocation,
    dispatch,
  };
}
