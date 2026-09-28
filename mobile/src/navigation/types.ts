import type { NavigatorScreenParams } from "@react-navigation/native";
import type { ProfileStackParamList } from "./ProfileStack";

/** A video pending to be shared into a chat, carried through Chat/Messages
 *  navigation from the feed's Share sheet "More" flow. */
export type PendingShareVideo = { id: number; caption?: string | null; thumbnail_url?: string | null; duration?: number | null };

/** The original story being reposted, carried into StoryComposer so it can
 *  skip straight to the editor with the original's media already loaded -
 *  see StoryUploadScreen's `repostOf` prop. */
export type RepostOf = {
  id: number;
  media_url: string;
  thumbnail_url?: string | null;
  isVideo: boolean;
  user: { username: string; name: string | null; avatar: string | null; is_verified: boolean };
  is_ai_generated: boolean;
};

/**
 * Single root stack. The feed (Main tabs) is always the first screen - guests
 * land there directly. Auth screens are presented as modals over the feed, so
 * closing them returns the user to the exact same feed position.
 */
export type RootStackParamList = {
  Main: undefined;        // bottom-tab navigator (feed + tabs) - guest-accessible
  /**
   * Settings / account stack (the surviving pre-rebuild screens), reached from
   * the Profile tab.
   *
   * Typed with its nested params so callers can jump straight to a screen
   * inside it - navigate("SettingsShell", { screen: "ProfileInfo" }). It was
   * `undefined`, which typechecked only because every existing caller used
   * useNavigation<any>(); the one properly-typed screen that tried it was
   * rejected. Still optional, so plain navigate("SettingsShell") is unchanged.
   *
   * `import type` on both, so this stays erased at compile time and cannot
   * create a runtime cycle back into the navigator.
   */
  SettingsShell: NavigatorScreenParams<ProfileStackParamList> | undefined;
  StudioRoot: undefined;  // Reelsoo Studio - standalone full-screen experience over the tabs
  // The full-screen post viewer is deliberately NOT a route. It has to paint
  // above CreatorProfileLayer, which is mounted after </Stack.Navigator>, and
  // no stack screen can. It lives in post-viewer.store + PostViewerLayer.
  Search: { autoFocus?: boolean } | undefined; // full-screen search + discovery page
  // NOTE: there is deliberately no `Hashtag` route. One was declared here but
  // never registered in RootNavigator and no screen was ever written, so
  // navigating to it crashed - a trap for anyone who trusted this type. Tag
  // results are handled inside SearchScreen instead (it queries
  // /explore/hashtags/{name} directly). Re-add this only alongside a real
  // <Stack.Screen>.
  Notifications: { category?: "system" | "followers" | "mentions" | "likes" | "comments"; group?: "account" | "followers" | "system"; scope?: "activity" | "gifts" | "system" } | undefined; // inbox category/menu feed
  Chat: { userId: number; username: string; name?: string | null; avatar?: string | null; isVerified?: boolean; request?: { conversationId: number; direction: "incoming" | "sent" }; shareVideo?: PendingShareVideo }; // direct-message thread
  ChatDetails: { userId: number; username: string; name?: string | null; avatar?: string | null }; // the ... sheet from a DM thread
  MessageRequests: undefined; // pending message-request inbox
  GiftsCoins: undefined; // coin balance, payout schedule and the gift ledger, from the Inbox
  CoinTopUp: undefined;  // buy Reelsoo Coins through the store's own billing
  WalletHistory: undefined; // the full coin ledger, filterable by type
  Withdraw: undefined;      // cash out earnings - tax form + payout method gated
  Messages: { shareVideo?: PendingShareVideo } | undefined; // full conversations list, opened via Inbox "See all" (or the Share sheet's "More" friends flow)
  UserProfile: { username: string }; // someone else's profile, pushed from a list
  // "View location feed" - every video tagged with this exact location
  // string (LocationFeedScreen, GET /locations/{slug}/videos - same backend
  // the website's own /location/[slug] page uses). `name` is only a
  // fallback label shown before the real header loads.
  LocationFeed: { slug: string; name?: string };
  Shop: { username: string };        // storefront opened from the profile's Shop button
  // Global Shop, opened from the feed header's "Shop" menu. Takes no params -
  // that is the whole difference from `Shop` above, which is one seller's
  // storefront and REQUIRES a username (ShopScreen reads route.params.username
  // and would throw without it).
  ShopHome: undefined;
  // "Add New Product" form, shop owner only. picked* are ShopCategoryPicker's
  // return value (returnTo: "AddProduct") - same nav-param-not-store pattern
  // EditShop uses, see that field's own comment below.
  AddProduct: {
    username: string;
    pickedCategoryId?: number;
    pickedCategoryName?: string;
    pickedSubcategoryId?: number;
    pickedSubcategoryName?: string;
    // AddVariation's return value - a finished variation to append to the
    // form's list. See that screen's own comment for why this moved off a
    // BottomSheet.
    newVariationName?: string;
    newVariationOptions?: string[];
  };
  ProductDetail: { productId: number }; // a single product's page, opened from a shop's product grid
  GiftsIntro: undefined;                // Studio -> Monetization -> Gifts: pitch + live requirements + "Get Coins Now"
  CreatorRewards: undefined;            // Studio -> Monetization -> Creator Rewards: pitch + live requirements + waitlist
  Subscriptions: undefined;             // Studio -> Monetization -> Subscriptions: pitch + live requirements + waitlist
  BrandMarketplace: undefined;          // Studio -> Monetization -> Brand Marketplace: pitch + live requirements + waitlist
  GiftsCoinsHelp: undefined;            // "?" on the Gifts & Coins intro - FAQ on sending, earning and getting paid
  SellerApplication: undefined;        // Settings -> Sell on Reelsoo (application/status, not the storefront)
  SellerApplicationWizard: undefined;  // the multi-step application form itself
  // Shop screen's owner-only "Edit Shop" - an APPROVED shop's settings, not
  // onboarding. picked* params are ShopCategoryPicker's return value - see
  // that screen's own comment for why a nav param rather than a store.
  EditShop: { pickedCategoryId?: number; pickedCategoryName?: string } | undefined;
  // Edit Shop -> Shop Category, and Add Product -> Category/Subcategory - one
  // searchable picker shared by both. `returnTo` picks which screen (and
  // which of its picked* params) the selection navigates back to; omitted
  // means EditShop, the original/default caller. `forSubcategory` + `parentId`
  // scope the list to one parent's children instead of the top-level list.
  ShopCategoryPicker: {
    selectedId: number | null;
    returnTo?: "AddProduct";
    forSubcategory?: boolean;
    parentId?: number;
    parentName?: string;
  };
  // Add Product -> Add Variation - choosing a variant type (Size, Color, ...)
  // and its options used to be a BottomSheet dropdown; moved to its own page,
  // same reasoning as ShopCategoryPicker's own move, and to get this
  // interaction off BottomSheet's gesture-handler-in-a-Modal surface
  // entirely. Type itself is a NavRow here that opens
  // AddVariationTypePicker below - same NavRow -> dedicated searchable-list
  // pattern as AddProduct's own Category row -> ShopCategoryPicker, rather
  // than an inline search+pill picker on this same page. picked* are that
  // screen's return value; pickedTypeId null (not undefined) means "Custom"
  // was explicitly chosen, since 0/undefined can't stand for a real,
  // possibly falsy row id. Returns straight back to AddProduct with the
  // finished variation.
  AddVariation: { username: string; pickedTypeId?: number | null; pickedTypeName?: string };
  // Add Variation -> Type. A tiny, purpose-built list (id/name/options),
  // not reused from ShopCategoryPicker - the data shape and "Custom" leading
  // row don't fit that screen's category-only contract.
  AddVariationTypePicker: { selectedId: number | null };
  Scan: undefined;                      // Profile (top-left) -> Scan a profile code / show your own
  AuthorizeLogin: { ticket: string };   // Scan -> a QR-login code was read - confirm/deny the website login
  ShopHelp: undefined;                 // "?" on the Sell on Reelsoo intro - FAQ on applying, selling and payouts

  // Shop Settings - the "Reelsoo Seller Center" hub, opened from ShopScreen's
  // owner-only gear button. Shop IDENTITY (name/description/logo/category)
  // stays on EditShop above - these are operations/selling/products/
  // customer-experience/policies/support.
  ShopSettings: undefined;
  ShopOrders: undefined;
  ShopOrderDetail: { orderId: number };
  ShopShippingSettings: undefined;
  ShopInventory: undefined;
  ShopCollections: undefined;
  ShopReviews: undefined;
  ShopNotificationSettings: undefined;
  ShopPolicies: undefined;
  ShopPause: undefined;
  ShopSupport: undefined;
  FollowList: { username: string; type: "followers" | "following" | "suggested"; userId?: number }; // followers/following/suggested lists
  ProfileViews: undefined; // "who viewed your profile" list (own profile)
  Premium: undefined;      // Reelsoo Premium - plans, features, FAQ (crown on own profile)
  SpaceRoom: { id: string };      // inside a live audio room (Spaces)
  SpacePeople: { id: string; tab?: "all" | "speakers" | "listeners" | "chat" }; // participant list / chat
  SpaceListeners: { id: string }; // Listeners + the host's request queue
  CreateSpace: undefined;         // host a new Space
  Live: undefined;                // Live discovery - browse live video broadcasts + Spaces together
  WatchLive: { id: number };      // watching one live video broadcast
  // New post - camera, gallery fallback, caption/settings, publish. `editVideoId`
  // (Studio Content's "Edit" button) skips straight to compose pre-filled from
  // that post's own full, freshly-fetched record (GET /videos/{id}, not
  // whatever Video object the caller already had) and PATCHes it on save
  // instead of creating a new one - see PostCameraScreenImpl's own comment
  // for what is/isn't real, and why it re-fetches rather than reusing a
  // passed-in object.
  PostCamera: { editVideoId?: number } | undefined;
  StoryComposer: { repostOf?: RepostOf } | undefined; // New story - pick media, caption, settings, share (or repost)
  StoryViewer: { username: string; storyId?: number }; // Watch one author's live stories, in order; storyId jumps to one specific story (e.g. from a chat's story-context bubble)
  SavedAccounts: undefined; // "Welcome back" saved-accounts picker (shown when the device has saved accounts)
  ManageSavedAccounts: undefined; // remove / reorder / rename saved accounts
  Login: undefined;       // "Log in to Reelsoo" options
  LoginForm: { prefillLogin?: string; expired?: boolean } | undefined; // email/username + password form
  ForgotPassword: { prefillEmail?: string } | undefined; // email-only form that emails a reset link
  Signup: undefined;      // "Create your Reelsoo account" options
  EmailSignup: undefined; // 3-step email OTP signup flow
  PolicyViewer: { policy?: "privacy" | "terms" | "guidelines"; url?: string; title?: string }; // in-app legal page popup (modal WebView)
};

/** @deprecated kept for the legacy AuthStack; the root stack is now canonical. */
export type AuthStackParamList = {
  Signup: undefined;
  Login: undefined;
  LoginForm: undefined;
  EmailSignup: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Audio: undefined;
  Create: undefined;
  Friends: undefined;
  Inbox: undefined;
  Profile: undefined;
};
