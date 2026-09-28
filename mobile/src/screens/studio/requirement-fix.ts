import { Alert } from "react-native";

/**
 * Where each unmet, non-counted (pass/fail) requirement is actually
 * resolved - shared by every programme's requirements checklist
 * (StudioProgrammeScreen's "Needs your attention" list, and the tap target
 * on an unmet row in GiftsIntroScreen/SellerApplicationScreen/
 * CreatorRewardsScreen/SubscriptionsScreen/BrandMarketplaceScreen).
 *
 * Deliberately does NOT cover counted metrics (followers, public videos,
 * qualified views, watch minutes, engagement rate, posting streak, account
 * age) - there is no setting to flip for any of those, they only grow with
 * real activity, so a row for one is never tappable and never appears here.
 *
 * `nav` is a root-stack target; `settings` nests into the Settings stack,
 * which is where 2FA and email verification live. A key with no entry here
 * renders as a plain, non-interactive row rather than a dead tap target.
 */

export const REQUIREMENT_FIX: Record<string, { label: string; nav?: string; settings?: string; note?: string }> = {
  two_factor:     { label: "Enable",   settings: "TwoFactor" },
  email:          { label: "Verify",   settings: "VerifyEmail" },
  tax:            { label: "Add PAN",  nav: "TaxForms" },
  profile:        { label: "Complete", settings: "ProfileInfo" },
  identity:       { label: "Verify",   nav: "Studio" },
  age18:          { label: "Verify",   settings: "EditBirthday" },
  // No screen resolves these - they need a person. Saying so beats a button
  // that goes nowhere.
  strikes:        { label: "How to appeal", note: "Guideline strikes are reviewed by our moderation team. Contact support to appeal." },
  brand_safety:   { label: "How to appeal", note: "Brand-safety flags are reviewed by our partnerships team. Contact support to appeal." },
  unique_account: { label: "Learn more",    note: "Only one account per person can be monetized. If you believe this is a mistake, contact support." },
  region:         { label: "Learn more",    note: "This programme has not opened in your region yet." },
  guidelines:     { label: "Learn more",    note: "Your account is restricted. Monetization resumes once the restriction is lifted." },
  merchant:       { label: "Review",   note: "The merchant agreement is presented during onboarding for programmes that require it." },
  disclosure:     { label: "Learn more",    note: "Enable disclosure labelling from the programme's own settings once it's open." },
  pledge:         { label: "Learn more",    note: "The original content pledge is presented during onboarding for programmes that require it." },
};

/** Tap handler shared by every requirement row that offers a fix - resolves
 *  `navigation` generically (root stack vs nested Settings stack) or falls
 *  back to an explanatory alert for anything a person has to resolve. */
export function goFixRequirement(navigation: any, key: string, label: string): void {
  const fix = REQUIREMENT_FIX[key];
  if (!fix) return;
  if (fix.settings) navigation.navigate("SettingsShell", { screen: fix.settings });
  else if (fix.nav) navigation.navigate(fix.nav);
  else if (fix.note) Alert.alert(label, fix.note);
}
