import { Tabs } from 'expo-router';
import { Home, Dumbbell, TrendingUp, Sparkles, UserRound } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from '../../lib/layout';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // The bar floats above the home indicator / gesture bar: never closer than TAB_BAR_GAP to the screen edge.
  const bottom = Math.max(insets.bottom, 8) + TAB_BAR_GAP - 8;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          bottom,
          left: 14,
          right: 14,
          elevation: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: TAB_BAR_HEIGHT,
          borderRadius: 29,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          </View>
        ),
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#0b5fc4',
        tabBarInactiveTintColor: '#566379',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
        tabBarItemStyle: { borderRadius: 21, marginHorizontal: 1, marginVertical: 4 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="workout" options={{ title: 'Train', tabBarAccessibilityLabel: 'Train', tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Progress', tabBarAccessibilityLabel: 'Progress', tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} /> }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarAccessibilityLabel: 'Coach', tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarAccessibilityLabel: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
      {/* Reachable from Home, Profile and Coach rather than from the bar. */}
      <Tabs.Screen name="nutrition" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFill as object,
    borderRadius: 29,
    overflow: 'hidden',
    backgroundColor: 'rgba(250, 253, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#173b66',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});
