import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Screen } from "@/components/Screen";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";
import { GoogleIcon, TikTokIcon, FacebookIcon } from "@/components/BrandIcons";
import { TermsNote, BottomLink, AuthClose } from "@/components/AuthParts";
import { colors } from "@/constants/colors";
import { spacing } from "@/constants/theme";
import { useSocialAuth } from "@/hooks/useSocialAuth";
import type { AuthStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { apple, google } = useSocialAuth();
  const soon = (what: string) => Alert.alert("Coming soon", `${what} isn't enabled yet.`);

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <AuthClose onPress={() => navigation.popToTop()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}><Logo /></View>

        <Text style={styles.title}>Log in to Teezer</Text>
        <Text style={styles.subtitle}>Welcome back to your video world</Text>

        <View style={styles.buttons}>
          <AuthButton
            icon={<Ionicons name="mail-outline" size={22} color={colors.brand} />}
            label="Use Email"
            onPress={() => navigation.navigate("LoginForm")}
          />
          <AuthButton icon={<GoogleIcon />} label="Continue with Google" onPress={google} />
          <AuthButton icon={<TikTokIcon />} label="Continue with TikTok" onPress={() => soon("TikTok login")} />
          <AuthButton icon={<FacebookIcon />} label="Continue with Facebook" onPress={() => soon("Facebook login")} />
          <AuthButton icon={<Ionicons name="logo-apple" size={23} color={colors.black} />} label="Continue with Apple" onPress={apple} />
        </View>

        <TermsNote verb="continuing" />
      </ScrollView>

      <BottomLink prompt="Don't have an account?" action="Sign up" onPress={() => navigation.replace("Signup")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  logoWrap: { alignItems: "center", marginBottom: spacing.xxl },
  title: { fontSize: 27, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.sm, fontSize: 15, color: colors.textMuted, textAlign: "center" },
  buttons: { marginTop: spacing.xxl, gap: spacing.md },
});
