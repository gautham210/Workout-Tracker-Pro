import React from 'react';
import { StyleSheet, View, ViewStyle, Dimensions, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';


interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
}

export default function GlassCard({ children, style, strong = false }: GlassCardProps) {
  const innerBg = strong ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const borderColors: [string, string] = strong 
    ? ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)'] 
    : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)'];

  return (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      style={[styles.gradientBorder, style]}
    >
      <BlurView
        intensity={strong ? 40 : 25}
        tint="dark"
        style={[styles.blurContent, { backgroundColor: innerBg }]}
      >
        {/* Absolute top thin reflection edge */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent'] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topReflectionEdge}
        />
        {children}
      </BlurView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBorder: {
    borderRadius: 24,
    padding: 1.2, // Border thickness
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  blurContent: {
    borderRadius: 22.8,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  topReflectionEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
