import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The floating tab bar is absolutely positioned, so every tab screen must pad
// its scroll content by the bar's footprint plus the device's bottom inset.
export const TAB_BAR_HEIGHT = 70;
export const TAB_BAR_GAP = 16;

export function useTabBarInset() {
  const insets = useSafeAreaInsets();
  return { bottom: insets.bottom, top: insets.top, contentBottom: TAB_BAR_HEIGHT + TAB_BAR_GAP + Math.max(insets.bottom, 8) + 20 };
}

/** Screens outside the tab navigator (active workout, settings) only need the device inset. */
export function useScreenInset() {
  const insets = useSafeAreaInsets();
  return { top: insets.top, bottom: insets.bottom, contentBottom: Math.max(insets.bottom, 12) + 24 };
}
