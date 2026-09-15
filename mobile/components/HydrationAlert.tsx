import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal } from 'react-native';
import { safeStorage as AsyncStorage } from '../lib/supabase';
import { Droplet, Settings, X, Check } from 'lucide-react-native';
import GlassCard from './GlassCard';

interface HydrationAlertProps {
  completedSetsCount: number;
  onDrinkLogged?: (oz: number) => void;
}

export default function HydrationAlert({ completedSetsCount, onDrinkLogged }: HydrationAlertProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [waterLogged, setWaterLogged] = useState(0);

  const [type, setType] = useState('disabled'); // 'disabled' | 'time' | 'sets'
  const [interval, setIntervalVal] = useState(4); // 10/15/20 min or 3/4/5 sets

  const setsTrackerRef = useRef(0);
  const timerRef = useRef<any>(null);

  // Load configuration from storage
  useEffect(() => {
    const loadConfig = async () => {
      const storedType = await AsyncStorage.getItem('wtp_hydro_type') || 'disabled';
      const storedInterval = await AsyncStorage.getItem('wtp_hydro_interval') || '4';
      const storedWater = await AsyncStorage.getItem('wtp_hydro_water_today') || '0';

      setType(storedType);
      setIntervalVal(parseInt(storedInterval, 10));
      setWaterLogged(parseInt(storedWater, 10));
      setupTimer(storedType, parseInt(storedInterval, 10));
    };

    loadConfig();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveConfig = async (newType: string, newInterval: number) => {
    setType(newType);
    setIntervalVal(newInterval);
    await AsyncStorage.setItem('wtp_hydro_type', newType);
    await AsyncStorage.setItem('wtp_hydro_interval', String(newInterval));
    setShowSettings(false);

    setsTrackerRef.current = 0;
    setupTimer(newType, newInterval);
  };

  const setupTimer = (alertType: string, intervalVal: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (alertType === 'time') {
      timerRef.current = setInterval(() => {
        setShowPopup(true);
        setTimeout(() => setShowPopup(false), 5000);
      }, intervalVal * 60000);
    }
  };

  if (!showPopup) return null;

  return (
    <View style={{ position: 'absolute', top: 50, right: 20, backgroundColor: '#0ea5e9', padding: 12, borderRadius: 20, elevation: 5, zIndex: 9999 }}>
      <Text style={{ color: 'white', fontWeight: 'bold' }}>Stay Hydrated! 💧</Text>
    </View>
  );
}