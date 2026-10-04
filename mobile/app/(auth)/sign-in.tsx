import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/GlassCard';
import StatusBanner from '../../components/StatusBanner';
import { isOfflineError } from '../../lib/api';
import { Dumbbell } from 'lucide-react-native';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Notice = { kind: 'error' | 'info' | 'success'; message: string } | null;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const normalizedEmail = () => email.trim().toLowerCase();

  const friendly = (error: { message?: string }) =>
    isOfflineError(error) ? 'You appear to be offline. Check your connection and try again.' : error.message || 'Something went wrong. Please try again.';

  function validate(requirePassword: boolean): boolean {
    if (!EMAIL_RE.test(normalizedEmail())) { setNotice({ kind: 'error', message: 'Enter a valid email address.' }); return false; }
    if (requirePassword && password.length < 8) { setNotice({ kind: 'error', message: 'Password must be at least 8 characters.' }); return false; }
    return true;
  }

  async function signInWithEmail() {
    setNotice(null);
    if (!validate(true) || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail(), password });
      if (error) setNotice({ kind: 'error', message: friendly(error) });
      // On success AuthProvider receives the session and the root layout navigates.
    } catch (error) {
      setNotice({ kind: 'error', message: friendly(error as Error) });
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithEmail() {
    setNotice(null);
    if (!validate(true) || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: normalizedEmail(), password });
      if (error) setNotice({ kind: 'error', message: friendly(error) });
      else if (!data.session) setNotice({ kind: 'success', message: 'Check your email to confirm your account, then sign in.' });
      // With a session, AuthProvider proceeds automatically.
    } catch (error) {
      setNotice({ kind: 'error', message: friendly(error as Error) });
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    setNotice(null);
    if (!validate(false) || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail());
      if (error) setNotice({ kind: 'error', message: friendly(error) });
      else setNotice({ kind: 'info', message: 'If an account exists for that email, a password reset link has been sent. Check your inbox.' });
    } catch (error) {
      setNotice({ kind: 'error', message: friendly(error as Error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <GlassCard strong style={styles.card}>
          <View style={styles.mark}><Dumbbell size={32} color="#fff" /></View>
          <Text style={styles.title}>Workout Tracker</Text>
          <Text style={styles.subtitle}>Your training, in focus</Text>

          {notice ? <StatusBanner kind={notice.kind} message={notice.message} style={styles.banner} /> : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9aa5b5"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor="#9aa5b5"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            editable={!loading}
            onSubmitEditing={signInWithEmail}
          />

          <TouchableOpacity accessibilityRole="button" style={[styles.button, loading && styles.disabled]} onPress={signInWithEmail} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" style={[styles.button, styles.outlineButton, loading && styles.disabled]} onPress={signUpWithEmail} disabled={loading}>
            <Text style={styles.outlineButtonText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" onPress={forgotPassword} disabled={loading} style={styles.link}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fc' },
  scroll: { flexGrow: 1, padding: 20, justifyContent: 'center' },
  card: { padding: 30, alignItems: 'center' },
  mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#007aff', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#172033', marginBottom: 6, letterSpacing: -0.7 },
  subtitle: { color: '#68758a', fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 28 },
  banner: { width: '100%', marginBottom: 16 },
  input: { width: '100%', backgroundColor: '#f1f4f9', borderRadius: 14, padding: 16, color: '#172033', marginBottom: 16, fontSize: 16 },
  button: { width: '100%', backgroundColor: '#007aff', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(28,48,82,0.14)' },
  outlineButtonText: { color: '#24324a', fontSize: 16, fontWeight: '600' },
  link: { paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  linkText: { color: '#007aff', fontSize: 14, fontWeight: '600' },
});
