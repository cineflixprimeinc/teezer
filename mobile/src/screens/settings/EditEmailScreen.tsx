import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditShell, ClearableInput, PasswordConfirmModal } from "@/components/settings/EditShell";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import type { ProfileDetails } from "@/types";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Edit Email - password-verified change that re-triggers email verification. */
export function EditEmailScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [value, setValue] = useState(initial);
  const [pwOpen, setPwOpen] = useState(false);

  const trimmed = value.trim();
  const valid = EMAIL_RE.test(trimmed);
  const canSave = valid && trimmed.toLowerCase() !== initial.trim().toLowerCase();

  const change = useMutation({
    mutationFn: (password: string) => accountApi.changeEmail(trimmed, password),
    onSuccess: (res) => {
      const cur = queryClient.getQueryData<ProfileDetails>(["profileMe"]);
      if (cur) queryClient.setQueryData(["profileMe"], { ...cur, email: res.data.email });
      const u = useAuthStore.getState().user;
      if (u) setUser({ ...u, email: res.data.email });
      setPwOpen(false);
      Alert.alert("Email updated", res.message || "Please verify your new email address.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert("Couldn't update email", apiErrorMessage(err, "Please try again.")),
  });

  function onSave() {
    if (!valid) { Alert.alert("Invalid email", "Please enter a valid email address."); return; }
    setPwOpen(true);
  }

  return (
    <EditShell
      title="Email Address"
      helper="We'll use this email to contact you."
      canSave={canSave}
      onSave={onSave}
    >
      <ClearableInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        maxLength={191}
        placeholder="you@example.com"
      />
      <PasswordConfirmModal
        visible={pwOpen}
        title="Change email"
        busy={change.isPending}
        onConfirm={(pw) => change.mutate(pw)}
        onClose={() => setPwOpen(false)}
      />
    </EditShell>
  );
}
