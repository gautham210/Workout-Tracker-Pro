import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/GlassCard';
import { Dumbbell } from 'lucide-react-native';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) Alert.alert('Sign In Failed', error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) Alert.alert('Sign Up Failed', error.message);
    else Alert.alert('Success', 'Check your email for the login link!');
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <GlassCard strong style={styles.card}>
        <View style={styles.mark}><Dumbbell size={32} color="#fff" /></View>
        <Text style={styles.title}>Workout Tracker</Text>
        <Text style={styles.subtitle}>Your training, in focus</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9aa5b5"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9aa5b5"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.outlineButton]} onPress={signUpWithEmail} disabled={loading}>
          <Text style={styles.outlineButtonText}>Create Account</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fc',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    padding: 30,
    alignItems: 'center',
  },
  mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#007aff', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 6,
    letterSpacing: -0.7,
  },
  subtitle: { color: '#68758a', fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 28 },
  input: {
    width: '100%',
    backgroundColor: '#f1f4f9',
    borderRadius: 14,
    padding: 16,
    color: '#172033',
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    width: '100%',
    backgroundColor: '#007aff',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(28,48,82,0.14)',
  },
  outlineButtonText: {
    color: '#24324a',
    fontSize: 16,
    fontWeight: '600',
  }
});
