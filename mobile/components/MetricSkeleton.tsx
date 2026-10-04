import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Pulsing placeholder blocks shown while real data loads. */
export default function MetricSkeleton({ rows = 3, height = 72 }: { rows?: number; height?: number }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }).map((_, i) => <Animated.View key={i} style={[styles.block, { height, opacity }]} />)}
    </View>
  );
}

const styles = StyleSheet.create({ block: { borderRadius: 20, backgroundColor: '#e3e9f2', marginBottom: 12 } });
