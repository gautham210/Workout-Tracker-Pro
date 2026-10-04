import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ProgressRingProps {
  /** 0-100. Values outside the range are clamped for the arc only; the label is whatever you pass. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  activeColor?: string;
  backgroundColor?: string;
  /** Large centred text (e.g. "1,240"). Defaults to the rounded percentage. */
  label?: string;
  caption?: string;
  accessibilityLabel?: string;
}

export default function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
  activeColor = '#007AFF',
  backgroundColor = 'rgba(28, 48, 82, 0.10)',
  label,
  caption,
  accessibilityLabel,
}: ProgressRingProps) {
  const clamped = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${Math.round(clamped)} percent${caption ? ` ${caption}` : ''}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={backgroundColor} strokeWidth={strokeWidth} fill="transparent" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.innerContent}>
        <Text style={styles.valueText} numberOfLines={1} adjustsFontSizeToFit>{label ?? `${Math.round(clamped)}%`}</Text>
        {caption ? <Text style={styles.captionText} numberOfLines={1}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center', position: 'relative' },
  svg: { position: 'absolute' },
  innerContent: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  valueText: { color: '#172033', fontSize: 20, fontWeight: '800' },
  captionText: { color: '#566379', fontSize: 11, fontWeight: '600' },
});
