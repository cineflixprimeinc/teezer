import { Alert } from "react-native";
import { useAuthStore } from "@/store/auth.store";

/**
 * Shared logout confirmation. When the active account is saved on this device it
 * offers the Instagram-style choice - keep the card for quick re-login, or wipe
 * it - so a logout never silently discards (or silently keeps) a saved account.
 * When the account isn't saved it's a plain confirm.
 *
 * `onDone` runs after signOut kicks off (e.g. navigate back to the feed).
 */
export function confirmLogout(onDone: () => void) {
  const st = useAuthStore.getState();
  const activeId = st.user?.id;
  const saved = activeId != null && st.isSaved(activeId);
  const doLogout = (removeSaved: boolean) => { void st.signOut({ removeSaved }); onDone(); };

  if (saved) {
    Alert.alert(
      "Log out",
      "Would you like to keep this account saved on this device?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout & Keep Saved", onPress: () => doLogout(false) },
        { text: "Logout & Remove Saved Account", style: "destructive", onPress: () => doLogout(true) },
      ],
    );
  } else {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => doLogout(false) },
    ]);
  }
}
