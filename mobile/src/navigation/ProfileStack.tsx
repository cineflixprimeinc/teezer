import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { AccountSettingsScreen } from "@/screens/settings/AccountSettingsScreen";
import { ProfileInfoScreen } from "@/screens/settings/ProfileInfoScreen";
import { EditFullNameScreen } from "@/screens/settings/EditFullNameScreen";
import { EditUsernameScreen } from "@/screens/settings/EditUsernameScreen";
import { EditBioScreen } from "@/screens/settings/EditBioScreen";
import { EditCategoryScreen } from "@/screens/settings/EditCategoryScreen";
import { EditGenderScreen } from "@/screens/settings/EditGenderScreen";
import { EditBirthdayScreen } from "@/screens/settings/EditBirthdayScreen";
import { EditEmailScreen } from "@/screens/settings/EditEmailScreen";
import { EditPhoneScreen } from "@/screens/settings/EditPhoneScreen";
import { EditLocationScreen } from "@/screens/settings/EditLocationScreen";
import { SocialLinksScreen } from "@/screens/settings/SocialLinksScreen";
import { CountryRegionScreen } from "@/screens/settings/CountryRegionScreen";
import { CountryDocumentScreen } from "@/screens/settings/CountryDocumentScreen";
import { AccountDataScreen } from "@/screens/settings/AccountDataScreen";
import { LoginSecurityScreen } from "@/screens/settings/LoginSecurityScreen";
import { PrivacySafetyScreen } from "@/screens/settings/PrivacySafetyScreen";
import { TwoFactorScreen } from "@/screens/settings/TwoFactorScreen";
import { VerifyEmailScreen } from "@/screens/settings/VerifyEmailScreen";
import { ProfileActionsScreen } from "@/screens/profile/ProfileActionsScreen";
import { FindFriendsScreen } from "@/screens/friends/FindFriendsScreen";
import { SuggestedAccountsScreen } from "@/screens/friends/SuggestedAccountsScreen";
import { FollowRequestsScreen } from "@/screens/friends/FollowRequestsScreen";
import { MyRestrictionsScreen } from "@/screens/settings/MyRestrictionsScreen";
import { NotificationSettingsScreen } from "@/screens/settings/NotificationSettingsScreen";
import { ContentPreferencesScreen } from "@/screens/settings/ContentPreferencesScreen";
import { AccessibilitySettingsScreen } from "@/screens/settings/AccessibilitySettingsScreen";
import { FamilyControlScreen } from "@/screens/settings/family/FamilyControlScreen";
import { ChildModeScreen } from "@/screens/settings/family/ChildModeScreen";
import { ContentControlsScreen } from "@/screens/settings/family/ContentControlsScreen";
import {
  FamilyPairingScreen,
  LinkedFamilyMembersScreen,
  ContentRestrictionsScreen,
  MessagingInteractionsScreen,
  LiveStreamingControlsScreen,
  ActivityReportsScreen,
  PurchaseApprovalScreen,
  EmergencyContactScreen,
} from "@/screens/settings/family/FamilyPlaceholders";
import { AppearanceScreen } from "@/screens/settings/preferences/AppearanceScreen";
import { StorageDataScreen } from "@/screens/settings/preferences/StorageDataScreen";
import { DownloadsScreen } from "@/screens/settings/preferences/DownloadsScreen";
import { MessagesSettingsScreen } from "@/screens/settings/preferences/MessagesSettingsScreen";
import { DigitalWellbeingScreen } from "@/screens/settings/preferences/DigitalWellbeingScreen";
import { ScreenTimeScreen } from "@/screens/settings/preferences/ScreenTimeScreen";
import { AIFeaturesScreen } from "@/screens/settings/preferences/AIFeaturesScreen";
import { ConnectedAccountsScreen } from "@/screens/settings/connected/ConnectedAccountsScreen";
import { AuthorizedAppsScreen } from "@/screens/settings/connected/AuthorizedAppsScreen";
import { ActiveSessionsScreen } from "@/screens/settings/connected/SessionScreens";
import { PoliciesScreen } from "@/screens/legal/PoliciesScreen";
import { HelpCenterScreen } from "@/screens/help/HelpCenterScreen";
import { ReportProblemScreen } from "@/screens/help/ReportProblemScreen";
import { AboutReelsooScreen } from "@/screens/help/AboutReelsooScreen";

/**
 * The Profile tab is a stack so its sub-pages (Settings, Profile actions) render
 * *inside* the tab - the bottom navigation stays visible, matching the designs.
 */
export type ProfileStackParamList = {
  Settings: undefined;
  AccountSettings: undefined;
  ProfileInfo: undefined;
  SocialLinks: undefined;
  CountryRegion: undefined;
  CountryDocument: undefined;
  AccountData: undefined;
  LoginSecurity: undefined;
  PrivacySafety: undefined;
  TwoFactor: undefined;
  VerifyEmail: undefined;
  EditFullName: { value?: string };
  EditUsername: { value?: string };
  EditBio: { value?: string };
  EditCategory: { value?: string[] };
  EditGender: { value?: string };
  EditBirthday: { value?: string };
  EditEmail: { value?: string };
  EditPhone: { value?: string };
  EditLocation: { value?: string };
  ProfileActions: undefined;
  FindFriends: undefined;
  SuggestedAccounts: undefined;
  FollowRequests: undefined;
  MyRestrictions: undefined;
  NotificationSettings: undefined;
  ContentPreferences: undefined;
  AccessibilitySettings: undefined;
  FamilyControl: undefined;
  ChildMode: undefined;
  ContentControls: undefined;
  FamilyPairing: undefined;
  LinkedFamilyMembers: undefined;
  ContentRestrictions: undefined;
  MessagingInteractions: undefined;
  LiveStreamingControls: undefined;
  ActivityReports: undefined;
  PurchaseApproval: undefined;
  EmergencyContact: undefined;
  Appearance: undefined;
  StorageData: undefined;
  Downloads: undefined;
  MessagesSettings: undefined;
  DigitalWellbeing: undefined;
  ScreenTime: undefined;
  AIFeatures: undefined;
  ConnectedAccounts: undefined;
  AuthorizedApps: undefined;
  ActiveSessions: undefined;
  Policies: undefined;
  HelpCenter: undefined;
  ReportProblem: undefined;
  AboutReelsoo: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  return (
    <Stack.Navigator
      initialRouteName="ProfileActions"
      screenOptions={{
        headerShown: false,
        // iOS gets this push/pop + edge-swipe-back for free from native-stack;
        // Android's own default is a platform-native fade instead. Forcing it
        // here matches iOS on both, same as RootNavigator/StudioStack. Screens
        // with their own explicit `options.animation` (modals, full-screen
        // slide-ups) are untouched - a Stack.Screen's own options win over this.
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <Stack.Screen name="ProfileInfo" component={ProfileInfoScreen} />
      <Stack.Screen name="SocialLinks" component={SocialLinksScreen} />
      <Stack.Screen name="CountryRegion" component={CountryRegionScreen} />
      <Stack.Screen name="CountryDocument" component={CountryDocumentScreen} />
      <Stack.Screen name="AccountData" component={AccountDataScreen} />
      <Stack.Screen name="LoginSecurity" component={LoginSecurityScreen} />
      <Stack.Screen name="PrivacySafety" component={PrivacySafetyScreen} />
      <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="EditFullName" component={EditFullNameScreen} />
      <Stack.Screen name="EditUsername" component={EditUsernameScreen} />
      <Stack.Screen name="EditBio" component={EditBioScreen} />
      <Stack.Screen name="EditCategory" component={EditCategoryScreen} />
      <Stack.Screen name="EditGender" component={EditGenderScreen} />
      <Stack.Screen name="EditBirthday" component={EditBirthdayScreen} />
      <Stack.Screen name="EditEmail" component={EditEmailScreen} />
      <Stack.Screen name="EditPhone" component={EditPhoneScreen} />
      <Stack.Screen name="EditLocation" component={EditLocationScreen} />
      <Stack.Screen name="ProfileActions" component={ProfileActionsScreen} />
      <Stack.Screen name="FindFriends" component={FindFriendsScreen} />
      <Stack.Screen name="SuggestedAccounts" component={SuggestedAccountsScreen} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} />
      <Stack.Screen name="MyRestrictions" component={MyRestrictionsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <Stack.Screen name="ContentPreferences" component={ContentPreferencesScreen} />
      <Stack.Screen name="AccessibilitySettings" component={AccessibilitySettingsScreen} />
      <Stack.Screen name="FamilyControl" component={FamilyControlScreen} />
      <Stack.Screen name="ChildMode" component={ChildModeScreen} />
      <Stack.Screen name="ContentControls" component={ContentControlsScreen} />
      <Stack.Screen name="FamilyPairing" component={FamilyPairingScreen} />
      <Stack.Screen name="LinkedFamilyMembers" component={LinkedFamilyMembersScreen} />
      <Stack.Screen name="ContentRestrictions" component={ContentRestrictionsScreen} />
      <Stack.Screen name="MessagingInteractions" component={MessagingInteractionsScreen} />
      <Stack.Screen name="LiveStreamingControls" component={LiveStreamingControlsScreen} />
      <Stack.Screen name="ActivityReports" component={ActivityReportsScreen} />
      <Stack.Screen name="PurchaseApproval" component={PurchaseApprovalScreen} />
      <Stack.Screen name="EmergencyContact" component={EmergencyContactScreen} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} />
      <Stack.Screen name="StorageData" component={StorageDataScreen} />
      <Stack.Screen name="Downloads" component={DownloadsScreen} />
      <Stack.Screen name="MessagesSettings" component={MessagesSettingsScreen} />
      <Stack.Screen name="DigitalWellbeing" component={DigitalWellbeingScreen} />
      <Stack.Screen name="ScreenTime" component={ScreenTimeScreen} />
      <Stack.Screen name="AIFeatures" component={AIFeaturesScreen} />
      <Stack.Screen name="ConnectedAccounts" component={ConnectedAccountsScreen} />
      <Stack.Screen name="AuthorizedApps" component={AuthorizedAppsScreen} />
      <Stack.Screen name="ActiveSessions" component={ActiveSessionsScreen} />
      <Stack.Screen name="Policies" component={PoliciesScreen} />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} />
      <Stack.Screen name="AboutReelsoo" component={AboutReelsooScreen} />
    </Stack.Navigator>
  );
}
