import { useState } from "react";
import { Alert } from "react-native";
import { useRoute } from "@react-navigation/native";
import { EditShell, ClearableInput, CharCounter } from "@/components/settings/EditShell";
import { profileApi } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useProfileFieldSave } from "./useProfileSave";
import { USERNAME_MAX, USERNAME_MIN, USERNAME_RE } from "./profileFields";

/** Edit Username - checks availability against the backend before saving. */
export function EditUsernameScreen() {
  const route = useRoute();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [value, setValue] = useState(initial);
  const [checking, setChecking] = useState(false);
  const save = useProfileFieldSave();

  const trimmed = value.trim();
  const validFormat = USERNAME_RE.test(trimmed) && trimmed.length >= USERNAME_MIN;
  const canSave = validFormat && trimmed !== initial.trim() && !checking && !save.isPending;

  async function onSave() {
    if (trimmed.length < USERNAME_MIN) { Alert.alert("Too short", `Username must be at least ${USERNAME_MIN} characters.`); return; }
    if (!USERNAME_RE.test(trimmed)) { Alert.alert("Invalid username", "Only letters, numbers, underscore and dot are allowed."); return; }
    setChecking(true);
    try {
      const res = await profileApi.checkUsername(trimmed);
      if (!res.available) { Alert.alert("Username unavailable", res.reason || "That username is already taken."); return; }
      save.mutate({ username: trimmed });
    } catch (e) {
      Alert.alert("Couldn't check username", apiErrorMessage(e, "Please try again."));
    } finally {
      setChecking(false);
    }
  }

  return (
    <EditShell
      title="Username"
      helper="Usernames can only be changed once every 30 days."
      canSave={canSave}
      saving={checking || save.isPending}
      onSave={onSave}
    >
      <ClearableInput
        value={value}
        onChangeText={(t) => setValue(t.replace(/\s/g, ""))}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={USERNAME_MAX}
        placeholder="username"
      />
      <CharCounter length={value.length} max={USERNAME_MAX} />
    </EditShell>
  );
}
