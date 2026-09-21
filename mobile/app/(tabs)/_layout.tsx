import { Tabs } from 'expo-router';
import { Home, Dumbbell, Activity, Flame, Utensils } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          elevation: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 64,
          borderRadius: 32,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            <BlurView intensity={38} tint="light" style={StyleSheet.absoluteFill} />
          </View>
        ),
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#007aff',
        tabBarInactiveTintColor: '#7a8799',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color, size }) => <Activity color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          tabBarIcon: ({ color, size }) => <Flame color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          tabBarIcon: ({ color, size }) => <Utensils color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFill as object,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
});
