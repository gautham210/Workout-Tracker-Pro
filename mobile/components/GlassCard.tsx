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
  const innerBg = strong ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.90)';
  const borderColors: [string, string] = strong 
    ? ['rgba(255,255,255,1)', 'rgba(196,207,225,0.72)']
    : ['rgba(255,255,255,0.98)', 'rgba(205,214,230,0.66)'];

  return (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      style={[styles.gradientBorder, style]}
    >
      <BlurView
        intensity={strong ? 40 : 25}
        tint="light"
        style={[styles.blurContent, { backgroundColor: innerBg }]}
      >
        {/* Absolute top thin reflection edge */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.9)', 'transparent'] as any}
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
    shadowColor: '#263754',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 4,
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
