import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi, ProfileUpdatePayload } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import type { ProfileDetails } from "@/types";

/**
 * Shared PUT /profile mutation for the field editors: persists the change,
 * updates the cached own-profile + auth store, then pops back to Profile
 * Information (which re-reads the fresh value).
 */
export function useProfileFieldSave() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (payload: ProfileUpdatePayload) => profileApi.update(payload),
    onSuccess: (fresh: ProfileDetails) => {
      queryClient.setQueryData(["profileMe"], fresh);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      const u = useAuthStore.getState().user;
      if (u) setUser({ ...u, name: fresh.name, username: fresh.username, bio: fresh.bio ?? null });
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save", apiErrorMessage(err, "Please try again.")),
  });
}
