import { useState } from "react";
import { useRoute } from "@react-navigation/native";
import { EditShell, FieldRow } from "@/components/settings/EditShell";
import { DatePickerModal } from "@/components/DatePickerModal";
import { useProfileFieldSave } from "./useProfileSave";
import { formatDOB } from "./profileFields";

/** Edit Birthday - tappable row opens the date picker. */
export function EditBirthdayScreen() {
  const route = useRoute();
  const initial = ((route.params ?? {}) as { value?: string }).value ?? "";
  const [dob, setDob] = useState(initial);
  const [open, setOpen] = useState(false);
  const save = useProfileFieldSave();

  const canSave = !!dob && dob !== initial;

  return (
    <EditShell
      title="Birthday"
      helper="This won't be shown publicly."
      canSave={canSave}
      saving={save.isPending}
      onSave={() => save.mutate({ date_of_birth: dob })}
    >
      <FieldRow value={formatDOB(dob)} placeholder="Select date" icon="calendar-outline" onPress={() => setOpen(true)} />
      <DatePickerModal visible={open} value={dob} onConfirm={setDob} onClose={() => setOpen(false)} />
    </EditShell>
  );
}
