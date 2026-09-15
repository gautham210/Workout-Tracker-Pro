import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Vibration } from 'react-native';
import { safeStorage as AsyncStorage } from '../lib/supabase';
import { Timer, Play, Pause, Plus, X } from 'lucide-react-native';
import GlassCard from './GlassCard';

interface WorkoutTimerProps {
  activeExerciseName: string;
  triggerCount: number;
  onSkip?: () => void;
}

export function getRestDurationForExercise(exerciseName: string): number {
  const name = (exerciseName || '').toLowerCase();
  const compounds = ['squat', 'bench', 'deadlift', 'press', 'row', 'pullup', 'chinup', 'dips', 'lunge', 'clean', 'jerk', 'snatch'];
  const isolations = ['lateral raise', 'fly', 'curl', 'extension', 'pushdown', 'calf raise', 'shrug', 'face pull', 'rear delt', 'plank', 'crunch'];
  
  if (compounds.some(c => name.includes(c))) return 120;
  if (isolations.some(i => name.includes(i))) return 60;
  return 90;
}

export default function WorkoutTimer({ activeExerciseName, triggerCount, onSkip }: WorkoutTimerProps) {
  const [isActive, setIsActive] = useState(false);
  const [duration, setDuration] = useState(90);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const timerRef = useRef<any>(null);

  // Sync with AsyncStorage on trigger
  useEffect(() => {
    if (triggerCount === 0) return;

    const initiateTimer = async () => {
      const targetSec = getRestDurationForExercise(activeExerciseName);
      const endTimestamp = Date.now() + targetSec * 1000;

      await (AsyncStorage as any).multiSet([
        ['wtp_timer_active', 'true'],
        ['wtp_timer_duration', String(targetSec)],
        ['wtp_timer_end', String(endTimestamp)],
        ['wtp_timer_paused', 'false'],
        ['wtp_timer_paused_remaining', '0'],
      ]);

      setDuration(targetSec);
      setTimeLeft(targetSec);
      setIsPaused(false);
      setIsActive(true);
    };

    initiateTimer();
  }, [triggerCount, activeExerciseName]);

  if (!isActive) return null;

  return (
    <View style={{ padding: 16, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>Rest Timer: {timeLeft}s</Text>
    </View>
  );
}