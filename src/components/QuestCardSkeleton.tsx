import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function QuestCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.imagePlaceholder} />
      <View style={styles.content}>
        <View style={[styles.line, { width: "40%", height: 10 }]} />
        <View style={[styles.line, { width: "90%", height: 16, marginTop: 8 }]} />
        <View style={[styles.line, { width: "75%", height: 16, marginTop: 6 }]} />
        <View style={[styles.line, { width: "55%", height: 12, marginTop: 10 }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
  },
  imagePlaceholder: {
    width: "100%",
    height: 180,
    backgroundColor: "#334155",
  },
  content: {
    padding: 14,
  },
  line: {
    backgroundColor: "#334155",
    borderRadius: 6,
  },
});
