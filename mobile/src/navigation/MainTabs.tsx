import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { ds } from "@/theme/design";
import { TeezerTabBar } from "@/components/nav/TeezerTabBar";
import { SpaceMiniBar } from "@/components/spaces/SpaceMiniBar";
import { TAB_BAR_HEIGHT } from "@/constants/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { HomeScreen } from "@/screens/feed/HomeScreen";
import { SpacesScreen } from "@/screens/spaces/SpacesScreen";
import { InboxScreen } from "@/screens/inbox/InboxScreen";
import { ProfileTabScreen } from "@/screens/profile/ProfileTabScreen";

/**
 * The five-tab shell (Home / Spaces / [+] / Inbox / Profile).
 *
 * Bottom tabs, tapped - not swiped. Horizontal swipe is reserved for gestures
 * inside a screen (the feed's creator layer), so the navigator never competes
 * with them for the same touch.
 */

const Tab = createBottomTabNavigator();

/** The minimised-Space pill, docked just above the tab bar. */
function SpaceMiniBarDock() {
  const insets = useSafeAreaInsets();
  return <SpaceMiniBar bottom={TAB_BAR_HEIGHT + insets.bottom + 8} />;
}

export function MainTabs() {
  // Create opens the camera directly (Story and Space already have their own
  // entry points - the profile ring / Inbox tile for Story, the Spaces tab's
  // own "Start a Space" for Space), so it is a straight navigate, gated the
  // same way every other posting action in the app is.
  const navigation = useNavigation<any>();
  const requireAuth = useRequireAuth();

  return (
    // SpaceAudioProvider is NOT here - it wraps RootNavigator in App.tsx, because
    // SpaceRoom is a root-level screen and would otherwise sit outside it. The
    // mini bar stays here: it belongs above the tab bar, and the store it reads
    // is global.
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: ds.bg } }}
      // No inboxBadge prop: the bar reads the real unread count itself. Passing
      // a hard-coded 0 here is what kept the Inbox tab permanently uncounted.
      tabBar={(props: BottomTabBarProps) => (
        <>
          <SpaceMiniBarDock />
          <TeezerTabBar
            {...props}
            onCreate={() => requireAuth(() => navigation.navigate("PostCamera"))}
          />
        </>
      )}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Spaces" component={SpacesScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Profile" component={ProfileTabScreen} />
    </Tab.Navigator>
  );
}
