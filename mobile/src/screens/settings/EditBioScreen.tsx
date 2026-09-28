import { useState } from "react";
import { useRoute } from "@react-navigation/native";
import { EditShell, ClearableInput, CharCounter } from "@/components/settings/EditShell";
import { useProfileFieldSave } from "./useProfileSave";
import { BIO_MAX } from "./profileFields";

/** Edit Bio - multi-line, up to 150 chars (website rule). Bio may be cleared. */
export function EditBioScreen() {
  const route = useRoute();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [value, setValue] = useState(initial);
  const save = useProfileFieldSave();

  const canSave = value.trim() !== initial.trim();

  return (
    <EditShell
      title="Bio"
      helper="You can write a short bio to tell people about yourself."
      canSave={canSave}
      saving={save.isPending}
      onSave={() => save.mutate({ bio: value.trim() || null })}
    >
      <ClearableInput
        value={value}
        onChangeText={setValue}
        multiline
        autoFocus
        maxLength={BIO_MAX}
        placeholder="Tell people about yourself"
      />
      <CharCounter length={value.length} max={BIO_MAX} />
    </EditShell>
  );
}
