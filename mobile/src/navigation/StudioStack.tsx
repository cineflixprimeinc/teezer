import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StudioScreen, type StudioSection } from "@/screens/studio/StudioScreen";
import type { Video } from "@/types";
import { StudioTransactionsScreen } from "@/screens/studio/StudioTransactionsScreen";
import { IdeaHubScreen } from "@/screens/studio/IdeaHubScreen";
import { StudioSettingsDetailScreen, type StudioSettingsCategory } from "@/screens/studio/StudioSettingsDetailScreen";
import { TaxFormsScreen } from "@/screens/studio/TaxFormsScreen";
import { TaxFormWizardScreen } from "@/screens/studio/TaxFormWizardScreen";
import { TaxGuideScreen } from "@/screens/studio/TaxGuideScreen";
import { StudioSettingChoiceScreen } from "@/screens/studio/StudioSettingChoiceScreen";
import { StudioCountryChoiceScreen } from "@/screens/studio/StudioCountryChoiceScreen";
import { PayoutMethodScreen } from "@/screens/studio/PayoutMethodScreen";
import { PaymentMethodsScreen } from "@/screens/studio/PaymentMethodsScreen";
import { StudioLegalScreen } from "@/screens/studio/StudioLegalScreen";
import { AdAccountScreen } from "@/screens/studio/AdAccountScreen";
import { AdBillingScreen } from "@/screens/studio/AdBillingScreen";
import { AdPaymentHistoryScreen } from "@/screens/studio/AdPaymentHistoryScreen";
import { AdPromoCreditsScreen } from "@/screens/studio/AdPromoCreditsScreen";
import { StudioProgrammeScreen } from "@/screens/studio/StudioProgrammeScreen";
import { PostInsightsScreen } from "@/screens/studio/PostInsightsScreen";
import { type StudioChoiceKey, type StudioCountryKey } from "@/screens/studio/studio-choices";
import { type StudioLegalDoc } from "@/screens/studio/studio-legal-content";
import { type ProgrammeKey } from "@/screens/studio/studio-programmes";

/**
 * Reelsoo Studio is a standalone, full-screen experience (TikTok-Studio style):
 * it is mounted as a SINGLE root-level route ("StudioRoot" in RootNavigator),
 * ABOVE the bottom-tab shell - so no main-app AppBar or Bottom Navigation is
 * visible while it is open, and the main app (feed, scroll positions, playback)
 * stays mounted and frozen underneath, ready to be restored exactly on exit.
 *
 * This navigator holds Studio's OWN, independent page hierarchy. The dashboard
 * (`Studio`) is the entry route; its back button / the OS back gesture pops the
 * whole StudioRoot route and returns the user to wherever they were.
 */
export type StudioStackParamList = {
  // `section` jumps straight to a Studio tab on open/return (e.g. Post
  // Insights' "Promote this post" -> Ads); `promoteVideo` is the specific
  // post to promote, handed to the Ads section so it can open the campaign
  // wizard already pointed at it instead of asking the creator to pick it
  // again. Both are consumed once and cleared (see StudioScreen) so
  // returning to Studio normally afterwards doesn't replay them.
  Studio: { section?: StudioSection; promoteVideo?: Video } | undefined;
  StudioTransactions: undefined;
  IdeaHub: undefined;
  StudioSettingsDetail: { category: StudioSettingsCategory };
  TaxForms: undefined;
  TaxFormWizard: undefined;
  TaxGuide: undefined;
  StudioSettingChoice: { settingKey: StudioChoiceKey };
  StudioCountryChoice: { settingKey: StudioCountryKey };
  PaymentMethods: undefined;
  PayoutMethod: { methodId?: string } | undefined;
  StudioLegal: { doc: StudioLegalDoc };
  AdAccount: undefined;
  AdBilling: undefined;
  AdPaymentHistory: undefined;
  AdPromoCredits: undefined;
  /** One monetization programme's page - all five share the screen. */
  StudioProgramme: { key: ProgrammeKey };
  /** Content tab's "Insight" button - one video's own performance. */
  PostInsights: { id: number };
};

const Stack = createNativeStackNavigator<StudioStackParamList>();

export function StudioStack() {
  return (
    <Stack.Navigator
      initialRouteName="Studio"
      screenOptions={{
        headerShown: false,
        // iOS gets this push/pop + edge-swipe-back for free from native-stack;
        // Android's own default is a platform-native fade instead. Forcing it
        // here matches iOS on both, same as RootNavigator/ProfileStack. Screens
        // with their own explicit `options.animation` are untouched - a
        // Stack.Screen's own options win over this.
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen name="Studio" component={StudioScreen} />
      <Stack.Screen name="StudioTransactions" component={StudioTransactionsScreen} />
      <Stack.Screen name="IdeaHub" component={IdeaHubScreen} />
      <Stack.Screen name="StudioSettingsDetail" component={StudioSettingsDetailScreen} />
      <Stack.Screen name="TaxForms" component={TaxFormsScreen} />
      <Stack.Screen name="TaxFormWizard" component={TaxFormWizardScreen} />
      <Stack.Screen name="TaxGuide" component={TaxGuideScreen} />
      <Stack.Screen name="StudioSettingChoice" component={StudioSettingChoiceScreen} />
      <Stack.Screen name="StudioCountryChoice" component={StudioCountryChoiceScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="PayoutMethod" component={PayoutMethodScreen} />
      <Stack.Screen name="StudioLegal" component={StudioLegalScreen} />
      <Stack.Screen name="AdAccount" component={AdAccountScreen} />
      <Stack.Screen name="AdBilling" component={AdBillingScreen} />
      <Stack.Screen name="AdPaymentHistory" component={AdPaymentHistoryScreen} />
      <Stack.Screen name="AdPromoCredits" component={AdPromoCreditsScreen} />
      <Stack.Screen name="StudioProgramme" component={StudioProgrammeScreen} />
      <Stack.Screen name="PostInsights" component={PostInsightsScreen} />
    </Stack.Navigator>
  );
}
