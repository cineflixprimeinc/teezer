import { useEffect, useState } from "react";
import { NavigationContainer, DefaultTheme, StackActions, getStateFromPath } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { colors } from "@/constants/colors";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { setUnauthorizedHandler } from "@/api/client";
import { Splash } from "@/components/Splash";
import { SocialOnboardingScreen } from "@/screens/auth/SocialOnboardingScreen";
import { ProfileStack } from "./ProfileStack";
import { MainTabs } from "./MainTabs";
import { navigationRef } from "./ref";
import { linkingScreens, rewritePathForNavigation } from "./deep-links";
import { activityTracker } from "@/services/activity-tracker";
import { AuthGateModal } from "@/screens/auth/AuthGateScreen";
import { SaveAccountPromptModal } from "@/components/auth/SaveAccountPromptModal";
import { SavedAccountsScreen } from "@/screens/auth/SavedAccountsScreen";
import { ManageSavedAccountsScreen } from "@/screens/auth/ManageSavedAccountsScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { LoginFormScreen } from "@/screens/auth/LoginFormScreen";
import { ForgotPasswordScreen } from "@/screens/auth/ForgotPasswordScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { EmailSignupScreen } from "@/screens/auth/EmailSignupScreen";
import { PolicyViewerScreen } from "@/screens/legal/PolicyViewerScreen";
import { CreatorProfileLayer } from "@/screens/profile/CreatorProfileLayer";
import { StoryUploadScreen } from "@/screens/story/StoryUploadScreen";
import { PostCameraScreen } from "@/screens/create/PostCameraScreen";
import { StoryViewerScreen } from "@/screens/story/StoryViewerScreen";
import { FollowListScreen } from "@/screens/friends/FollowListScreen";
import { FollowListLayer } from "@/screens/friends/FollowListLayer";
import { CreateSpaceScreen } from "@/screens/spaces/CreateSpaceScreen";
import { SpaceRoomScreen } from "@/screens/spaces/SpaceRoomScreen";
import { PeopleInSpaceScreen } from "@/screens/spaces/PeopleInSpaceScreen";
import { ListenersScreen } from "@/screens/spaces/ListenersScreen";
import { LiveDiscoveryScreen } from "@/screens/live/LiveDiscoveryScreen";
import { WatchLiveScreen } from "@/screens/live/WatchLiveScreen";
import { ProfileViewsScreen } from "@/screens/profile/ProfileViewsScreen";
import { PremiumScreen } from "@/screens/premium/PremiumScreen";
import { UserProfileScreen } from "@/screens/profile/ProfileTabScreen";
import { LocationFeedScreen } from "@/screens/location/LocationFeedScreen";
import { ShopScreen } from "@/screens/profile/ShopScreen";
import { ShopHomeScreen } from "@/screens/shop/ShopHomeScreen";
import { AddProductScreen } from "@/screens/profile/AddProductScreen";
import { ProductDetailScreen } from "@/screens/profile/ProductDetailScreen";
import { SellerApplicationScreen } from "@/screens/profile/SellerApplicationScreen";
import { GiftsIntroScreen } from "@/screens/studio/GiftsIntroScreen";
import { CreatorRewardsScreen } from "@/screens/studio/CreatorRewardsScreen";
import { SubscriptionsScreen } from "@/screens/studio/SubscriptionsScreen";
import { BrandMarketplaceScreen } from "@/screens/studio/BrandMarketplaceScreen";
import { GiftsCoinsHelpScreen } from "@/screens/studio/GiftsCoinsHelpScreen";
import { SellerApplicationWizardScreen } from "@/screens/profile/SellerApplicationWizardScreen";
import { EditShopScreen } from "@/screens/profile/EditShopScreen";
import { ShopCategoryPickerScreen } from "@/screens/profile/ShopCategoryPickerScreen";
import { AddVariationScreen } from "@/screens/profile/AddVariationScreen";
import { AddVariationTypePickerScreen } from "@/screens/profile/AddVariationTypePickerScreen";
import { ScanScreen } from "@/screens/profile/ScanScreen";
import { AuthorizeLoginScreen } from "@/screens/profile/AuthorizeLoginScreen";
import { ShopHelpScreen } from "@/screens/profile/ShopHelpScreen";
import { ShopSettingsScreen } from "@/screens/profile/ShopSettingsScreen";
import { ShopOrdersScreen } from "@/screens/profile/ShopOrdersScreen";
import { ShopOrderDetailScreen } from "@/screens/profile/ShopOrderDetailScreen";
import { ShopShippingSettingsScreen } from "@/screens/profile/ShopShippingSettingsScreen";
import { ShopInventoryScreen } from "@/screens/profile/ShopInventoryScreen";
import { ShopCollectionsScreen } from "@/screens/profile/ShopCollectionsScreen";
import { ShopReviewsScreen } from "@/screens/profile/ShopReviewsScreen";
import { ShopNotificationSettingsScreen } from "@/screens/profile/ShopNotificationSettingsScreen";
import { ShopPoliciesScreen } from "@/screens/profile/ShopPoliciesScreen";
import { ShopPauseScreen } from "@/screens/profile/ShopPauseScreen";
import { ShopSupportScreen } from "@/screens/profile/ShopSupportScreen";
import { PostViewerLayer } from "@/screens/profile/PostViewerLayer";
import { NotificationsScreen } from "@/screens/inbox/NotificationsScreen";
import { MessageRequestsScreen } from "@/screens/inbox/MessageRequestsScreen";
import { GiftsCoinsScreen } from "@/screens/inbox/GiftsCoinsScreen";
import { CoinTopUpScreen } from "@/screens/inbox/CoinTopUpScreen";
import { WalletHistoryScreen } from "@/screens/inbox/WalletHistoryScreen";
import { WithdrawScreen } from "@/screens/inbox/WithdrawScreen";
import { StudioStack } from "@/navigation/StudioStack";
import { ChatScreen } from "@/screens/inbox/ChatScreen";
import { ChatDetailsScreen } from "@/screens/inbox/ChatDetailsScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.brand },
};

/**
 * Deep linking.
 *
 * `prefixes` claims the URL shapes; `config.screens` maps the ones that have a
 * screen. `getStateFromPath` is the seam: it runs every incoming path through
 * the central router first (see deep-links.ts), which collapses destinations
 * that have no screen yet onto their fallback, then hands the result to React
 * Navigation's own parser so the back stack is built correctly.
 *
 * Without that rewrite, a link to an unbuilt surface (a video, a hashtag, a
 * comment) yields an empty navigation state and the app opens on nothing.
 */
const linking = {
  prefixes: [Linking.createURL("/"), "https://teezer.live", "https://www.teezer.live", "teezer://"],
  config: { screens: linkingScreens },
  getStateFromPath: (path: string, options: Parameters<typeof getStateFromPath>[1]) =>
    getStateFromPath(rewritePathForNavigation(path), options),
};

/**
 * Stripped-back shell.
 *
 * The feed, explore, spaces, inbox, profile, search, player and story surfaces,
 * the whole bottom-tab shell, and Reelsoo Studio were removed to rebuild the app
 * from a clean base. What is left is deliberately the smallest thing that still
 * runs:
 *
 *   Settings  - the three-dot actions page (ProfileActions) plus every settings
 *               sub-page, mounted as the app's initial route. This is now the
 *               entire app.
 *   Auth      - kept because most settings pages need a session.
 *   Legal     - the settings pages link into the policy viewer.
 *
 * Everything shared (api client, stores, realtime, theme, components) is
 * untouched, so re-adding a surface means adding a screen and a route here.
 *
 * The previous version of this file is the reference for how the tab shell,
 * modals and presentation options were wired: see the tree at
 * backup/pre-teardown-2026-07-30.
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const loginCount = useAuthStore((s) => s.loginCount);
  const needsSocialOnboarding = useAuthStore((s) => !!s.user?.needs_social_onboarding);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const signOut = useAuthStore((s) => s.signOut);

  /* The branded Splash is otherwise only up for as long as the auth bootstrap
   * takes - a cached token resolves in well under a second, so it flashed by
   * almost unseen and the native OS splash (a plain icon, not this design) was
   * what actually registered as "the splash screen". Holding it for a flat
   * minimum, independent of how fast bootstrap finishes, is what makes the
   * branded design the thing people actually see. Does not cap the OTHER
   * direction - a slow bootstrap still keeps Splash up past 3s via the
   * `status === "loading"` half of the check below. */
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    void bootstrap();
    // A 401 just clears the (now-invalid) token rather than kicking the user to
    // a login screen.
    setUnauthorizedHandler(() => void signOut());
    return () => setUnauthorizedHandler(null);
  }, [bootstrap, signOut]);

  // After a successful login/signup: dismiss any open auth screen and replay the
  // action the guest had attempted. Only pops when an auth modal is actually
  // open - an account switch also bumps loginCount, and popToTop with no auth
  // screen on the stack would bubble to a navigator that can't handle it.
  useEffect(() => {
    if (status !== "authenticated" || !navigationRef.isReady()) return;
    const AUTH_ROUTES = ["SavedAccounts", "ManageSavedAccounts", "Login", "LoginForm", "ForgotPassword", "Signup", "EmailSignup"];
    const rootRoutes = navigationRef.getRootState()?.routes ?? [];
    if (rootRoutes.some((r) => AUTH_ROUTES.includes(r.name))) {
      navigationRef.dispatch(StackActions.popToTop());
    }
    const t = setTimeout(() => useAuthGate.getState().consume(), 0);
    return () => clearTimeout(t);
  }, [status, loginCount]);

  if (status === "loading" || !minSplashElapsed) {
    return <Splash />;
  }

  /* An account social sign-in just created has a server-invented username and
   * no birthday, so it finishes profile setup before anything else. Rendered
   * HERE, in place of the navigator rather than as a route on it, for two
   * reasons: there is no back gesture or deep link that can slip past it, and
   * it needs no navigation call to leave - the server returns the user with the
   * flag cleared, the store updates, and this branch simply stops matching, so
   * the app lands on the feed underneath.
   *
   * The flag rides on /auth/me too, so an onboarding interrupted by a crash or
   * a reinstall resumes on next launch instead of stranding a real account
   * mid-setup. Email signup never sets it and never sees this. */
  if (status === "authenticated" && needsSocialOnboarding) {
    return <SocialOnboardingScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={linking}
      onStateChange={() => activityTracker.setActivityForRoute(navigationRef.getCurrentRoute()?.name)}
    >
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
          headerShown: false,
          freezeOnBlur: true,
          // iOS gets this push/pop + edge-swipe-back for free from native-stack;
          // Android's own default is a platform-native fade instead. Forcing it
          // here matches iOS on both. Screens with their own explicit
          // `options.animation` below (the fullScreenModal slide-ups, Search's
          // and StoryViewer's fade, the modal group) are untouched - a
          // Stack.Screen's own options win over this navigator-level default.
          animation: "slide_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      >
        {/* The rebuilt app shell (feed + tabs), per the Claude Design prototype.
            This restores what RootStackParamList has always documented "Main" to
            be; the strip commit pointed it at the settings stack only as a
            temporary base. It also makes the three existing
            `navigate("Main", { screen: "Home" })` logout call sites resolve
            again - ProfileStack had no "Home" screen for them to land on. */}
        <Stack.Screen name="Main" component={MainTabs} />

        {/* The surviving pre-rebuild settings/account screens (53 of them).
            Kept mounted under their own route so nothing is stranded while the
            Profile tab is still being built; intra-stack `navigate("Settings")`
            style calls resolve as before, since they all originate inside it. */}
        <Stack.Screen name="SettingsShell" component={ProfileStack} />

        {/* Followers / following, for any account. At root rather than inside
            the settings stack because both the Profile tab and the swipe-in
            creator layer push it, and neither lives in that stack. */}
        <Stack.Screen name="FollowList" component={FollowListScreen} />

        {/* Host a new Space, pushed from the Spaces tab's "Start a space" card.
            Root level so it covers the bottom bar - it is a full-page form, not
            a tab. */}
        <Stack.Screen name="CreateSpace" component={CreateSpaceScreen} />

        {/* A Space opens as a full page (not the pull-down modal card): it slides
            up to fill the screen and is left via the X at the top. */}
        <Stack.Screen
          name="SpaceRoom"
          component={SpaceRoomScreen}
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="SpacePeople" component={PeopleInSpaceScreen} />
        <Stack.Screen name="SpaceListeners" component={ListenersScreen} />

        <Stack.Screen name="Live" component={LiveDiscoveryScreen} />
        {/* Full-screen video, same presentation as a Space room. */}
        <Stack.Screen
          name="WatchLive"
          component={WatchLiveScreen}
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />

        {/* New story. Full-screen and sliding up, like a Space and like the
            design's own panel - it covers the app while you are composing
            rather than sitting on it as a card. The route name was declared in
            types.ts long before now but never registered or navigated to. */}
        {/* Full-screen and fading in, the way every story viewer opens - a
            slide would read as a page rather than a takeover. */}
        <Stack.Screen
          name="StoryViewer"
          component={StoryViewerScreen}
          options={{ presentation: "fullScreenModal", animation: "fade" }}
        />

        <Stack.Screen
          name="StoryComposer"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        >
          {({ navigation, route }) => (
            <StoryUploadScreen onClose={() => navigation.goBack()} repostOf={route.params?.repostOf} />
          )}
        </Stack.Screen>

        {/* New post, opened directly by the tab bar's +. Same presentation as
            StoryComposer - it covers the app while composing. Opens the
            camera immediately; cancelling falls back to the gallery grid.
            Capture/pick and a bare caption step only - there is no
            POST /videos endpoint yet, so it stops there rather than
            pretending to publish. */}
        <Stack.Screen
          name="PostCamera"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        >
          {({ navigation, route }) => <PostCameraScreen onClose={() => navigation.goBack()} editVideoId={(route.params as { editVideoId?: number } | undefined)?.editVideoId} />}
        </Stack.Screen>

        {/* Who viewed your profile, opened from the eye in the profile's top
            bar. Root level for the same reason as FollowList: the Profile tab
            and the swiped-in creator layer both push it. */}
        <Stack.Screen name="ProfileViews" component={ProfileViewsScreen} />

        {/* Reelsoo Premium, opened by the crown in the profile's top bar. Its
            own full-screen route rather than a sheet: the page scrolls through
            plans, a comparison table and an FAQ, which is far more than a sheet
            should hold. */}
        <Stack.Screen name="Premium" component={PremiumScreen} />

        {/* Another creator's profile, pushed from any of those lists. Root
            level so it stacks: profile -> their followers -> another profile,
            each with a working back. */}
        <Stack.Screen name="UserProfile" component={UserProfileScreen} />
        <Stack.Screen name="LocationFeed" component={LocationFeedScreen} />

        {/* Global Shop browsing page. No longer reachable from the feed
            header (its "Shop" tab was removed) - kept registered, unused
            for now, forward-compatible for a future entry point. Distinct
            from the per-seller storefront below, which needs a username. */}
        <Stack.Screen name="ShopHome" component={ShopHomeScreen} />
        {/* The Shop tab's storefront - opened from the profile's Shop button. */}
        <Stack.Screen name="Shop" component={ShopScreen} />
        {/* "Add New Product" - opened from the Shop screen's owner-only + button. */}
        <Stack.Screen name="AddProduct" component={AddProductScreen} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />

        {/* "Sell on Reelsoo" - the seller application/onboarding flow, opened
            from Settings -> Sell on Reelsoo (ProfileActionsScreen). NOT the
            Shop screen above - this is the application, not the storefront. */}
        <Stack.Screen name="SellerApplication" component={SellerApplicationScreen} />
        <Stack.Screen name="GiftsIntro" component={GiftsIntroScreen} />
        <Stack.Screen name="CreatorRewards" component={CreatorRewardsScreen} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
        <Stack.Screen name="BrandMarketplace" component={BrandMarketplaceScreen} />
        <Stack.Screen name="GiftsCoinsHelp" component={GiftsCoinsHelpScreen} />
        <Stack.Screen name="SellerApplicationWizard" component={SellerApplicationWizardScreen} />
        <Stack.Screen name="EditShop" component={EditShopScreen} />
        <Stack.Screen name="ShopCategoryPicker" component={ShopCategoryPickerScreen} />
        <Stack.Screen name="AddVariation" component={AddVariationScreen} />
        <Stack.Screen name="AddVariationTypePicker" component={AddVariationTypePickerScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="AuthorizeLogin" component={AuthorizeLoginScreen} />
        <Stack.Screen name="ShopHelp" component={ShopHelpScreen} />

        {/* Shop Settings - the "Reelsoo Seller Center" hub, opened from
            ShopScreen's owner-only gear button. Operations/selling/products/
            customer-experience/policies/support - never shop identity, which
            stays on EditShop above. */}
        <Stack.Screen name="ShopSettings" component={ShopSettingsScreen} />
        <Stack.Screen name="ShopOrders" component={ShopOrdersScreen} />
        <Stack.Screen name="ShopOrderDetail" component={ShopOrderDetailScreen} />
        <Stack.Screen name="ShopShippingSettings" component={ShopShippingSettingsScreen} />
        <Stack.Screen name="ShopInventory" component={ShopInventoryScreen} />
        <Stack.Screen name="ShopCollections" component={ShopCollectionsScreen} />
        <Stack.Screen name="ShopReviews" component={ShopReviewsScreen} />
        <Stack.Screen name="ShopNotificationSettings" component={ShopNotificationSettingsScreen} />
        <Stack.Screen name="ShopPolicies" component={ShopPoliciesScreen} />
        <Stack.Screen name="ShopPause" component={ShopPauseScreen} />
        <Stack.Screen name="ShopSupport" component={ShopSupportScreen} />


        {/* The three feeds behind the inbox's pinned rows - activity, gifts
            and system - picked apart by the `scope` param. Root level so they
            cover the tab bar, like every other detail view here. */}
        <Stack.Screen name="Notifications" component={NotificationsScreen} />

        {/* Pending chats from people you do not follow. Root level so it
            covers the tab bar, like the other inbox detail views. */}
        <Stack.Screen name="MessageRequests" component={MessageRequestsScreen} />

        {/* Coin balance, payout schedule and the gift ledger, behind the
            inbox's "Gifts & coins" row. Root level for the same reason as the
            rows either side of it. */}
        <Stack.Screen name="GiftsCoins" component={GiftsCoinsScreen} />

        {/* Buying Reelsoo Coins. Its own screen because the store's billing is
            the only route in the app - Apple 3.1.1 / Play policy - so it shares
            nothing with the website's card and PayPal checkouts. */}
        <Stack.Screen name="CoinTopUp" component={CoinTopUpScreen} />

        {/* Every coin movement, filtered. Reached from the clock in the Gifts &
            coins header, which used to open an empty notification feed. */}
        <Stack.Screen name="WalletHistory" component={WalletHistoryScreen} />

        {/* Cash out. Gated on an approved tax form and a payout method, and the
            only place Reelsoo's commission is charged - gifts credit in full. */}
        <Stack.Screen name="Withdraw" component={WithdrawScreen} />

        {/* Reelsoo Studio - a standalone full-screen experience above the tab
            shell, with its own page hierarchy (StudioStack). The main app stays
            mounted underneath, so leaving Studio restores the feed exactly. */}
        <Stack.Screen name="StudioRoot" component={StudioStack} />

        {/* A DM thread. The route has been declared since the rebuild but had
            no screen - which is what blocked the Message button on profiles
            and every conversation row in the inbox. */}
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="ChatDetails" component={ChatDetailsScreen} />

        {/* Live search over GET /search. Declared in types since the
            rebuild with no screen behind it until now. */}
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          // A quick cross-fade, NOT a lateral push. Search is a mode you drop
          // into over the feed rather than a place further along a stack, and
          // the sideways travel made it feel like a journey; 150ms of fade
          // reads as instant while still being a transition rather than a cut.
          //
          // The feed itself needs no help here: `Main` stays mounted below
          // this screen, so its state, scroll position and the active
          // player's timestamp all survive untouched. FeedVideoItem gates the
          // video SOURCE on `active` and only playback on `focused`, so
          // blurring pauses in place rather than tearing the source down -
          // returning resumes the same frame with no re-buffer.
          options={{
            animation: "fade",
            // Short enough to feel immediate, and it finishes well before
            // SearchScreen's InteractionManager-deferred keyboard focus, so
            // the two never compete for the main thread.
            animationDuration: 150,
            // Kept so the iOS edge swipe and the Android system back both
            // still dismiss. `fullScreenGestureEnabled` is deliberately gone
            // with the slide: a full-width drag needs lateral movement to
            // track, and there is none to follow in a fade.
            gestureEnabled: true,
          }}
        />

        {/* Full auth flows, presented as modals. `presentation: "modal"` alone
            is platform-adaptive like the default push was - iOS renders it as
            a bottom-sheet-style card, Android's own native modal does not
            look the same. Forcing animation: "slide_from_bottom" makes it
            match on both, same fix already used for PostCamera/StoryComposer/
            SpaceRoom below. */}
        <Stack.Group screenOptions={{ presentation: "modal", animation: "slide_from_bottom" }}>
          <Stack.Screen name="SavedAccounts" component={SavedAccountsScreen} />
          <Stack.Screen name="ManageSavedAccounts" component={ManageSavedAccountsScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="LoginForm" component={LoginFormScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="EmailSignup" component={EmailSignupScreen} />
          {/* In the modal group so it can stack on top of the auth modals too. */}
          <Stack.Screen name="PolicyViewer" component={PolicyViewerScreen} />
        </Stack.Group>
      </Stack.Navigator>

      {/* Creator profile swiped in from the feed. Mounted here, outside the tab
          navigator, because it is meant to cover the tab bar - reached by
          swipe, a profile is a detail view rather than a tab. Still inside
          NavigationContainer, since the profile screen it renders navigates. */}
      <CreatorProfileLayer />

      {/* Followers / following / suggested, opened from a swiped-in profile's
          counts. Mounted AFTER the creator layer for the same reason as the
          post viewer: as a route it opened UNDERNEATH that layer, so the layer
          had to be dismissed first - which is what made Back from the list
          land on the feed instead of the profile. */}
      <FollowListLayer />

      {/* A reel opened from a profile grid. Mounted AFTER the creator layer on
          purpose: as a route it could never sit above that layer, which is what
          forced the profile to be dismissed or parked out of the way and caused
          every flash on the way back. Here it simply covers the profile, and
          the profile stays exactly where it is - visible, stationary, mounted -
          until the viewer slides off it. */}
      <PostViewerLayer />

      {/* Guest auth popup - a plain overlay so closing it disturbs nothing. */}
      <AuthGateModal />
      {/* "Save this account?" prompt after a first-time sign-in on this device. */}
      <SaveAccountPromptModal />
    </NavigationContainer>
  );
}
