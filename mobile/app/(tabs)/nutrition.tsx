import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import GlassCard from '../../components/GlassCard';
import { Send, Utensils, User, Camera, X } from 'lucide-react-native';
import { sendChatMessage, scanFoodImage, ChatMessage } from '../../lib/api';
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
        const data = await scanFoodImage(selectedImage);
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `I couldn't analyze that image: ${err.message || 'Please choose another image and try again.'}`
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset.base64) return;
      const mimeType = asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
      setSelectedImage(`data:${mimeType};base64,${asset.base64}`);
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
            placeholderTextColor="#8a96a8"
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
  safeArea: { flex: 1, backgroundColor: '#f7f8fc' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,48,82,0.08)'
  },
  headerTitle: { color: '#172033', fontSize: 24, fontWeight: '700', marginLeft: 12, letterSpacing: -0.6 },
  
  chatArea: { flex: 1 },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  messageWrapperUser: { justifyContent: 'flex-end' },
  messageWrapperBot: { justifyContent: 'flex-start' },
  
  botAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#24324a', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  
  messageCard: { padding: 16, maxWidth: '75%' },
  userCard: { backgroundColor: 'rgba(52, 199, 89, 0.12)', borderColor: 'rgba(52, 199, 89, 0.25)' },
  botCard: { backgroundColor: 'rgba(255,255,255,0.9)' },
  messageText: { color: '#24324a', fontSize: 16, lineHeight: 24 },
  
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
    borderTopColor: 'rgba(28,48,82,0.08)',
    alignItems: 'center'
  },
  cameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#172033',
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
