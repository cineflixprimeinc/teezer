import { api } from "./client";
import type { AuthTokenResponse } from "@/types";

/**
 * Social sign-in. The app obtains a provider token natively
 * (Google: @react-native-google-signin, Apple: expo-apple-authentication)
 * and exchanges it here for a Reelsoo Sanctum token.
 */
export const socialApi = {
  google: (idToken: string) =>
    api.post<AuthTokenResponse>("/auth/social/google", { id_token: idToken }).then((r) => r.data),

  apple: (identityToken: string, name?: string) =>
    api.post<AuthTokenResponse>("/auth/social/apple", { identity_token: identityToken, name }).then((r) => r.data),
};
