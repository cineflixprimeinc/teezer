import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "@/constants/colors";
import { CoinPlansPanel } from "@/components/CoinPlansPanel";

/**
 * Buy Teezer Coins, as a full screen - reached from Gifts & Coins' "Top up".
 *
 * The catalog, the review-then-pay step and every store rule live in
 * CoinPlansPanel, which the gift sheet drops into its own body. One
 * implementation, so the two surfaces cannot drift into offering different
 * packs, different prices or different rules - the reason that panel was
 * exported rather than copied in the first place.
 */
export function CoinTopUpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      {/* The panel carries its own title and close control, so the screen adds
          no header of its own - closing here means leaving the screen. */}
      <CoinPlansPanel onClose={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
