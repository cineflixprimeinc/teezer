import { Alert } from "react-native";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import { socialApi } from "@/api/social.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { config } from "@/constants/config";

/** Native social sign-in handlers. Apple and Google are fully wired
    (backend ready); both native flows require a dev/production build - not
    Expo Go. */
export function useSocialAuth() {
  const signIn = useAuthStore((s) => s.signIn);
  const inExpoGo = Constants.appOwnership === "expo";

  async function apple() {
    // Apple's token is bound to the app's real bundle id (com.reelsoo.app),
    // which Expo Go can't provide - so guide the user to the installed build.
    if (inExpoGo) {
      Alert.alert("Sign in with Apple", "This works in the installed Teezer app build (not Expo Go).");
      return;
    }
    try {
      if (!(await AppleAuthentication.isAvailableAsync())) {
        Alert.alert("Sign in with Apple", "Apple Sign In isn't available on this device.");
        return;
      }
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) {
        Alert.alert("Sign in with Apple", "No identity token was returned. Please try again.");
        return;
      }
      const name = cred.fullName
        ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ") || undefined
        : undefined;
      const res = await socialApi.apple(cred.identityToken, name);
      await signIn(res.data.token, res.data.user);
    } catch (e) {
      if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") return; // user dismissed
      Alert.alert("Apple sign-in failed", apiErrorMessage(e, "Please try again."));
    }
  }

  async function google() {
    // @react-native-google-signin/google-signin is a bare native module -
    // unlike expo-apple-authentication above, it has NO Expo Go support at
    // all, and its own JS entry touches native bindings at import time. A
    // top-level `import` of it in this file (which Expo Go DOES evaluate,
    // since useSocialAuth() is reachable from LoginScreen/SignupScreen)
    // would crash the whole app on load there - same class of bug the
    // camera/scanner guards (nativeCamera.ts/nativeScan.ts) exist to avoid.
    // Required only here, at call time, after confirming this is a real build.
    if (inExpoGo) {
      Alert.alert("Sign in with Google", "This works in the installed Teezer app build (not Expo Go).");
      return;
    }
    if (!config.googleWebClientId) {
      Alert.alert("Sign in with Google", "Google sign-in isn't configured yet. Ask an admin to set it up in Settings.");
      return;
    }
    try {
      const { GoogleSignin, isSuccessResponse } = require("@react-native-google-signin/google-signin");
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      GoogleSignin.configure({
        webClientId: config.googleWebClientId,
        iosClientId: config.googleIosClientId || undefined,
        offlineAccess: false,
      });
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return; // user dismissed the sheet
      const idToken = result.data.idToken;
      if (!idToken) {
        Alert.alert("Sign in with Google", "No ID token was returned. Please try again.");
        return;
      }
      const res = await socialApi.google(idToken);
      await signIn(res.data.token, res.data.user);
    } catch (e) {
      // statusCodes.PLAY_SERVICES_NOT_AVAILABLE, same as the library's own
      // isErrorWithCode() guard - not using that helper here since it comes
      // back typed `any` through require(), same as everything else in this
      // function, and can't narrow `e` the way a real import would.
      if ((e as { code?: string })?.code === "PLAY_SERVICES_NOT_AVAILABLE") {
        Alert.alert("Sign in with Google", "Google Play Services isn't available on this device.");
        return;
      }
      Alert.alert("Google sign-in failed", apiErrorMessage(e, "Please try again."));
    }
  }

  return { apple, google };
}
