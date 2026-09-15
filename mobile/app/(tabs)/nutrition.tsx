import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import GlassCard from '../../components/GlassCard';
import { Send, Utensils, User, Camera, X } from 'lucide-react-native';
import { sendChatMessage, ChatMessage, BACKEND_URL } from '../../lib/api';
import * as ImagePicker from 'expo-image-picker';

export default function NutritionScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "I'm your AI Nutritionist. Ask me about your diet, macros, or upload a photo of your meal to estimate calories!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || loading) return;

    let userContent = input.trim();
    if (selectedImage) {
      userContent = `[Image Uploaded] ${userContent}`;
    }

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userContent }];
    setMessages(newMessages);
    setInput('');
    setSelectedImage(null);
    setLoading(true);

    const context = {
      user_stats: "No active profile data",
      goals: "No active goals",
    };

    if (selectedImage) {
      try {
        // Attempt to call a vision endpoint that would process the base64 image
        const response = await fetch(`${BACKEND_URL}/api/parse-food`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUri: selectedImage })
        });
        
        if (!response.ok) {
          throw new Error('Vision API endpoint (/api/parse-food) is not implemented on the server.');
        }
        
        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Error: ${err.message || 'Failed to process image.'} Please configure the Vision API endpoint.`
        }]);
      } finally {
        setLoading(false);
      }
    } else {
      try {
        const messagesToSent = newMessages.slice(-10);
        const response = await sendChatMessage(messagesToSent, context, true);
        setMessages(prev => [...prev, { role: 'assistant', content: response.text }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
      } finally {
        setLoading(false);
      }
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
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
          <Utensils color="#10b981" size={28} />
          <Text style={styles.headerTitle}>AI Nutritionist</Text>
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
                    <Utensils color="#fff" size={20} />
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
                <Utensils color="#fff" size={20} />
              </View>
              <GlassCard strong={false} style={[styles.messageCard, styles.botCard]}>
                <ActivityIndicator color="#10b981" size="small" />
              </GlassCard>
            </View>
          )}
        </ScrollView>

        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
              <X color="#fff" size={16} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.cameraBtn} onPress={pickImage}>
            <Camera color="#10b981" size={24} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.input}
            placeholder="Log a meal or ask about macros..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!input.trim() && !selectedImage) && styles.sendButtonDisabled]} 
            onPress={sendMessage}
            disabled={(!input.trim() && !selectedImage) || loading}
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
  
  botAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  
  messageCard: { padding: 16, maxWidth: '75%' },
  userCard: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  botCard: { backgroundColor: 'rgba(255,255,255,0.05)' },
  messageText: { color: '#fff', fontSize: 16, lineHeight: 24 },
  
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -8,
    left: 86,
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center'
  },
  cameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 }
});
