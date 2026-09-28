import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Screen } from "@/components/Screen";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";
import { GoogleIcon, TikTokIcon, FacebookIcon } from "@/components/BrandIcons";
import { OrDivider, TermsNote, BottomLink, AuthClose } from "@/components/AuthParts";
import { colors } from "@/constants/colors";
import { spacing } from "@/constants/theme";
import { isDev } from "@/constants/config";
import { useAuthStore } from "@/store/auth.store";
import { useSocialAuth } from "@/hooks/useSocialAuth";
import type { AuthStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const signIn = useAuthStore((s) => s.signIn);
  const { apple, google } = useSocialAuth();
  const soon = (provider: string) => Alert.alert("Coming soon", `${provider} sign-up isn't enabled yet.`);

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <AuthClose onPress={() => navigation.popToTop()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}><Logo /></View>

        <Text style={styles.title}>Create your Teezer account</Text>
        <Text style={styles.subtitle}>Join Teezer and start sharing your moments</Text>

        <View style={styles.buttons}>
          <AuthButton
            icon={<Ionicons name="mail-outline" size={22} color={colors.brand} />}
            label="Continue with Email"
            onPress={() => navigation.navigate("EmailSignup")}
          />
          <OrDivider />
          <AuthButton icon={<GoogleIcon />} label="Continue with Google" onPress={google} />
          <AuthButton icon={<TikTokIcon />} label="Continue with TikTok" onPress={() => soon("TikTok")} />
          <AuthButton icon={<FacebookIcon />} label="Continue with Facebook" onPress={() => soon("Facebook")} />
          <AuthButton icon={<Ionicons name="logo-apple" size={23} color={colors.black} />} label="Continue with Apple" onPress={apple} />
        </View>

        <TermsNote verb="signing up" />

        {isDev && (
          <Text
            style={styles.devLink}
            onPress={() => void signIn("dev-token", { id: 0, name: "Dev User", username: "dev", avatar: null, is_verified: false })}
          >
            Preview app (dev)
          </Text>
        )}
      </ScrollView>

      <BottomLink prompt="Already have an account?" action="Log in" onPress={() => navigation.replace("Login")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  logoWrap: { alignItems: "center", marginBottom: spacing.xxl },
  title: { fontSize: 27, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.sm, fontSize: 15, color: colors.textMuted, textAlign: "center" },
  buttons: { marginTop: spacing.xxl, gap: spacing.md },
  devLink: { marginTop: spacing.xl, textAlign: "center", color: colors.textFaint, fontSize: 13, textDecorationLine: "underline" },
});
