import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import GlassCard from '../../components/GlassCard';
import { Send, Bot, User, Sparkles } from 'lucide-react-native';
import { sendChatMessage, ChatMessage } from '../../lib/api';
import { buildAICoachContext } from '../../lib/ai-context';

export default function CoachScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your AI Coach. I can help you with workout generation, form checks, fitness questions, and plateaus." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    const context = await buildAICoachContext();

    // Only send the last 10 messages to save bandwidth and prevent oversized payloads
    const messagesToSent = newMessages.slice(-10);
    const response = await sendChatMessage(messagesToSent, context, false);
    
    setMessages([...newMessages, { role: 'assistant', content: response.text }]);
    setLoading(false);
  };

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, loading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Sparkles color="#0ea5e9" size={28} />
          <Text style={styles.headerTitle}>AI Coach</Text>
        </View>

        <ScrollView 
          ref={scrollViewRef}
          style={styles.chatArea} 
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        >
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <View key={index} style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperBot]}>
                {!isUser && (
                  <View style={styles.botAvatar}>
                    <Bot color="#fff" size={20} />
                  </View>
                )}
                
                <GlassCard strong={false} style={[styles.messageCard, isUser ? styles.userCard : styles.botCard]}>
                  <Text style={styles.messageText}>{msg.content}</Text>
                </GlassCard>

                {isUser && (
                  <View style={styles.userAvatar}>
                    <User color="#fff" size={20} />
                  </View>
                )}
              </View>
            );
          })}
          
          {loading && (
            <View style={[styles.messageWrapper, styles.messageWrapperBot]}>
              <View style={styles.botAvatar}>
                <Bot color="#fff" size={20} />
              </View>
              <GlassCard strong={false} style={[styles.messageCard, styles.botCard]}>
                <ActivityIndicator color="#0ea5e9" size="small" />
              </GlassCard>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about workouts, form, or plateaus..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} 
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Send color="#fff" size={20} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginLeft: 12 },
  
  chatArea: { flex: 1 },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  messageWrapperUser: { justifyContent: 'flex-end' },
  messageWrapperBot: { justifyContent: 'flex-start' },
  
  botAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  
  messageCard: { padding: 16, maxWidth: '75%' },
  userCard: { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderColor: 'rgba(14, 165, 233, 0.3)' },
  botCard: { backgroundColor: 'rgba(255,255,255,0.05)' },
  messageText: { color: '#fff', fontSize: 16, lineHeight: 24 },
  
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    marginRight: 12,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 }
});
