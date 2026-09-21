import { Tabs } from 'expo-router';
import { Home, Dumbbell, TrendingUp, Sparkles, UserRound } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 16,
          left: 14,
          right: 14,
          elevation: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 70,
          borderRadius: 29,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            <BlurView intensity={38} tint="light" style={StyleSheet.absoluteFill} />
          </View>
        ),
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#007aff',
        tabBarInactiveTintColor: '#7a8799',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
        tabBarItemStyle: { borderRadius: 21, marginHorizontal: 1, marginVertical: 4 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Train',
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="nutrition" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFill as object,
    borderRadius: 29,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 252, 255, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#173b66',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
});
