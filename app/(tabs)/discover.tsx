import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ResultsScreen } from "../../src/components/ResultsScreen";
import { SearchScreen } from "../../src/components/SearchScreen";
import { useQuestSearch } from "../../src/hooks/useQuestSearch";
import type { SearchInput } from "../../src/hooks/useQuestSearch";
import { useLocation } from "../../src/context/LocationContext";
import { trackScreen, trackSearch, trackSearchResultsReceived } from "../../src/services/analytics";

export default function DiscoverTab() {
  const insets = useSafeAreaInsets();
  const { location } = useLocation();
  const { phase, statusMessage, summary, results, nearbyResults, error, locationHint, search, reset } = useQuestSearch();
  const [lastInput, setLastInput] = useState<SearchInput | null>(null);

  const showResults = phase !== "idle" || results.length > 0 || error !== null;

  useEffect(() => { trackScreen("Discover"); }, []);

  useEffect(() => {
    if (phase === "done" && results.length > 0) {
      trackSearchResultsReceived({
        category: lastInput?.category ?? "unknown",
        resultCount: results.length,
        hasMapPins: results.some((r) => r.locationCoords !== null),
      });
    }
  }, [phase]);

  const handleSearch = useCallback(
    (input: SearchInput) => {
      setLastInput(input);
      trackSearch({
        category: input.category,
        distanceKm: input.distanceKm,
        descriptionLength: input.description.trim().length,
      });
      search(input);
    },
    [search]
  );

  const handleBack = useCallback(() => {
    reset();
    setLastInput(null);
  }, [reset]);

  const handleRetry = useCallback(() => {
    if (lastInput) search(lastInput);
  }, [lastInput, search]);

  return (
    <View style={[styles.container, { paddingTop: showResults ? 0 : insets.top }]}>
      {showResults ? (
        <ResultsScreen
          phase={phase}
          statusMessage={statusMessage}
          summary={summary}
          results={results}
          nearbyResults={nearbyResults}
          error={error}
          locationHint={locationHint}
          userCoords={location.coords}
          onBack={handleBack}
          onRetry={handleRetry}
        />
      ) : (
        <SearchScreen onSearch={handleSearch} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
});
