import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditShell, ClearableInput, PasswordConfirmModal } from "@/components/settings/EditShell";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import type { ProfileDetails } from "@/types";

/** Edit Phone - password-verified change (backend enforces uniqueness). */
export function EditPhoneScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [value, setValue] = useState(initial);
  const [pwOpen, setPwOpen] = useState(false);

  const trimmed = value.trim();
  const valid = trimmed.length >= 6;
  const canSave = valid && trimmed !== initial.trim();

  const change = useMutation({
    mutationFn: (password: string) => accountApi.changePhone(trimmed, password),
    onSuccess: (res) => {
      const cur = queryClient.getQueryData<ProfileDetails>(["profileMe"]);
      if (cur) queryClient.setQueryData(["profileMe"], { ...cur, phone: res.data.phone });
      const u = useAuthStore.getState().user;
      if (u) setUser({ ...u });
      setPwOpen(false);
      Alert.alert("Phone updated", res.message || "Your phone number was updated.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert("Couldn't update phone", apiErrorMessage(err, "Please try again.")),
  });

  function onSave() {
    if (!valid) { Alert.alert("Invalid number", "Please enter a valid phone number."); return; }
    setPwOpen(true);
  }

  return (
    <EditShell
      title="Phone Number"
      helper="Add your phone number for account security."
      canSave={canSave}
      onSave={onSave}
    >
      <ClearableInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        maxLength={30}
        placeholder="+977 98XXXXXXXX"
      />
      <PasswordConfirmModal
        visible={pwOpen}
        title="Change phone number"
        busy={change.isPending}
        onConfirm={(pw) => change.mutate(pw)}
        onClose={() => setPwOpen(false)}
      />
    </EditShell>
  );
}
