import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Bot, RotateCcw, Send } from 'lucide-react-native';
import PlanCard, { RawPlan, ResolvedPlan, resolvePlan } from './PlanCard';
import { ApiError, ChatMessage, sendChatMessage } from '../lib/api';
import { COLORS } from '../lib/analyticsHooks';

type Msg = {
  id: string; role: 'user' | 'assistant'; content: string;
  /** Local-only text (greeting). Never sent to the model. */
  local?: boolean;
  /** Error bubble. Never sent to the model. */
  error?: boolean;
  plan?: ResolvedPlan;
};

let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

/** Drops greeting/error bubbles and merges consecutive same-role turns so a failed send never corrupts the history. */
function toRequest(messages: Msg[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.local || m.error) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`.slice(0, 2000);
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return 'You appear to be offline. Check your connection and retry.';
    if (error.code === 'timeout') return 'The request timed out. Retry in a moment.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please retry.';
}

export default function PlanChat({ isNutritionist, greeting, placeholder, disclaimer, accent, bottomPad }: {
  isNutritionist: boolean; greeting: string; placeholder: string; disclaimer: string; accent: string; bottomPad: number;
}) {
  const [messages, setMessages] = useState<Msg[]>([{ id: 'greeting', role: 'assistant', content: greeting, local: true }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const alive = useRef(true);
  const busy = useRef(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { scroller.current?.scrollToEnd({ animated: true }); }, [messages, loading]);

  const request = useCallback(async (history: Msg[]) => {
    if (busy.current) return;
    busy.current = true; setLoading(true);
    try {
      const response = await sendChatMessage(toRequest(history), undefined, isNutritionist);
      let plan: ResolvedPlan | undefined;
      if (!isNutritionist && response.workoutPlan) {
        try { plan = await resolvePlan(response.workoutPlan as unknown as RawPlan); } catch { plan = undefined; }
      }
      if (alive.current) setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', content: response.text, plan }]);
    } catch (e) {
      if (alive.current) setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', content: errorText(e), error: true }]);
    } finally {
      busy.current = false; if (alive.current) setLoading(false);
    }
  }, [isNutritionist]);

  const send = () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { id: nextId(), role: 'user' as const, content: text.slice(0, 2000) }];
    setMessages(next); setInput('');
    request(next);
  };
  const retry = (errorId: string) => {
    if (loading) return;
    const history = messages.filter((m) => m.id !== errorId);
    setMessages(history);
    request(history);
  };

  const canSend = input.trim().length > 0 && !loading;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={styles.disclaimer}>{disclaimer}</Text>
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {messages.map((m) => {
          const user = m.role === 'user';
          return (
            <View key={m.id} style={[styles.rowWrap, user ? styles.rowUser : styles.rowBot]}>
              {!user ? <View style={[styles.avatar, { backgroundColor: m.error ? COLORS.red : accent }]}><Bot color="#fff" size={18} /></View> : null}
              <View style={{ maxWidth: '82%', flexShrink: 1 }}>
                <View style={[styles.bubble, user ? styles.userBubble : m.error ? styles.errorBubble : styles.botBubble]}>
                  <Text selectable style={[styles.text, user && { color: '#fff' }, m.error && { color: COLORS.red }]}>{m.content}</Text>
                  {m.error ? (
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry the last message" onPress={() => retry(m.id)} disabled={loading} style={styles.retry}>
                      <RotateCcw color={COLORS.red} size={14} /><Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {m.plan ? <PlanCard plan={m.plan} /> : null}
              </View>
            </View>
          );
        })}
        {loading ? (
          <View style={[styles.rowWrap, styles.rowBot]}>
            <View style={[styles.avatar, { backgroundColor: accent }]}><Bot color="#fff" size={18} /></View>
            <View style={[styles.bubble, styles.botBubble]}><ActivityIndicator color={accent} size="small" /></View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: keyboard ? 10 : bottomPad }]}>
        <TextInput
          accessibilityLabel="Message"
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#6b778b"
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1500}
          returnKeyType="default"
        />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" hitSlop={6} disabled={!canSend} onPress={send} style={[styles.send, { backgroundColor: accent }, !canSend && { opacity: 0.45 }]}>
          <Send color="#fff" size={19} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  disclaimer: { color: COLORS.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  rowWrap: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8 },
  rowUser: { justifyContent: 'flex-end' },
  rowBot: { justifyContent: 'flex-start' },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: COLORS.blueText },
  botBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line },
  errorBubble: { backgroundColor: COLORS.redSoft, borderWidth: 1, borderColor: '#f5c2c2' },
  text: { color: COLORS.ink, fontSize: 15, lineHeight: 22 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, marginTop: 4 },
  retryText: { color: COLORS.red, fontWeight: '800', fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.bg },
  input: { flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: '#fff', borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, color: COLORS.ink, fontSize: 16, borderWidth: 1, borderColor: '#c9d2e0' },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
