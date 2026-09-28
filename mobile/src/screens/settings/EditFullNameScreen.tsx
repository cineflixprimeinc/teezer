import { useState } from "react";
import { Alert } from "react-native";
import { useRoute } from "@react-navigation/native";
import { EditShell, ClearableInput, CharCounter } from "@/components/settings/EditShell";
import { useProfileFieldSave } from "./useProfileSave";
import { NAME_MAX } from "./profileFields";

/** Edit Full Name - Profile Information › Full Name. */
export function EditFullNameScreen() {
  const route = useRoute();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [value, setValue] = useState(initial);
  const save = useProfileFieldSave();

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initial.trim();

  function onSave() {
    if (!trimmed) { Alert.alert("Name required", "Please enter your name."); return; }
    save.mutate({ name: trimmed });
  }

  return (
    <EditShell
      title="Full Name"
      helper="Your name can only be changed once every 7 days."
      canSave={canSave}
      saving={save.isPending}
      onSave={onSave}
    >
      <ClearableInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={NAME_MAX}
        placeholder="Your name"
      />
      <CharCounter length={value.length} max={NAME_MAX} />
    </EditShell>
  );
}
