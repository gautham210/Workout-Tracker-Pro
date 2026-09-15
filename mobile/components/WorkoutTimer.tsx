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

  const [endTimestamp, setEndTimestamp] = useState<number | null>(null);

  // Sync with AsyncStorage on trigger
  useEffect(() => {
    if (triggerCount === 0) return;

    const targetSec = getRestDurationForExercise(activeExerciseName);
    const endTs = Date.now() + targetSec * 1000;
    
    setDuration(targetSec);
    setEndTimestamp(endTs);
    setIsActive(true);
    
  }, [triggerCount, activeExerciseName]);

  useEffect(() => {
    if (!isActive || !endTimestamp) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endTimestamp - now) / 1000));
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        setIsActive(false);
        Vibration.vibrate(500);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isActive, endTimestamp]);

  if (!isActive) return null;

  return (
    <View style={{ padding: 16, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, alignItems: 'center', marginBottom: 16, width: 200 }}>
      <GlassCard strong style={{ width: '100%', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Timer color="#0ea5e9" size={20} />
          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</Text>
        </View>
        <TouchableOpacity onPress={() => setIsActive(false)} style={{ marginTop: 8, padding: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Skip</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}