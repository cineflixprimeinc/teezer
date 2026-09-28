import { useCallback, useRef, useState } from "react";
import { Alert, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "@/components/BottomSheet";
import { MenuRow } from "@/components/sheet/MenuRow";
import { ReportSheet } from "@/components/report/ReportSheet";
import { profileApi } from "@/api/profile.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/** The website surface a shared or copied profile link points at. */
const WEB = "https://teezer.live";

/** Matches the web route - frontend/src/app/(main)/profile/[username]. */
export const profileUrl = (username: string) => `${WEB}/profile/${username}`;

/** Matches frontend/src/features/auth/login-content.tsx's own qrLoginUrl() -
 *  the QR code shown by the website's "Use QR code" login option. Scanned
 *  by ScanScreen.tsx, which routes it to AuthorizeLoginScreen instead of a
 *  profile. Same reasoning as profileUrl() for using a plain https URL
 *  rather than a custom scheme. */
export const qrLoginUrl = (ticket: string) => `${WEB}/qr-login/${ticket}`;

interface ProfileActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The account being acted on - never the signed-in user. */
  username: string;
}

/**
 * The ⋮ menu on someone else's profile: Report, Block, Share profile, Copy link.
 *
 * Share lives in here rather than as its own header icon. The header on another
 * account carries exactly two controls - the bell and this menu - so every
 * remaining action has to be reachable from one of them.
 *
 * Every action runs in `onClosed`, after the exit animation, never in `onClose`.
 * An Alert or a native share sheet raised while this Modal is still on screen
 * lands underneath it on iOS, so the sheet is closed first and the work is held
 * in `pending` until the Modal has actually unmounted - the same sequencing
 * AccountSwitcherSheet uses for its navigation.
 */
export function ProfileActionsSheet({ visible, onClose, username }: ProfileActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);
  /**
   * Blocked state is local and starts false: no profile endpoint reports
   * whether you have blocked someone, so this only ever reflects a block made
   * from this sheet in this session (ChatDetailsScreen does the same).
   */
  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  /** Work deferred until the sheet has finished animating out. */
  const pending = useRef<null | (() => void)>(null);
  const closeThen = useCallback(
    (fn?: () => void) => {
      pending.current = fn ?? null;
      onClose();
    },
    [onClose],
  );

  const confirmBlock = useCallback(() => {
    // Blocking is tied to an account. Always called via closeThen, so the
    // menu's own Modal has already finished closing by the time this runs -
    // safe to open the auth-gate popup here, same reasoning as Report/Send
    // below.
    if (!me) {
      useAuthGate.getState().open(confirmBlock);
      return;
    }
    Alert.alert(
      blocked ? `Unblock @${username}?` : `Block @${username}?`,
      blocked
        ? "They will be able to find your profile and message you again."
        : "They won't be able to find your profile or message you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blocked ? "Unblock" : "Block",
          style: blocked ? "default" : "destructive",
          onPress: () => {
            const next = !blocked;
            // Optimistic, reverted if the call fails - as ChatDetailsScreen does.
            setBlocked(next);
            (next ? profileApi.block(username) : profileApi.unblock(username)).catch(() => {
              setBlocked(!next);
              Alert.alert(
                next ? "Couldn't block" : "Couldn't unblock",
                "Please try again in a moment.",
              );
            });
          },
        },
      ],
    );
  }, [blocked, username, me]);

  const shareProfile = useCallback(() => {
    Share.share({ message: `@${username} on Teezer\n${profileUrl(username)}` }).catch(() => {});
  }, [username]);

  const copyLink = useCallback(() => {
    Clipboard.setStringAsync(profileUrl(username))
      .then(() => Alert.alert("Copied", "Profile link copied to clipboard."))
      .catch(() => Alert.alert("Couldn't copy", "Please try again in a moment."));
  }, [username]);

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={() => closeThen()}
      onClosed={() => {
        const cb = pending.current;
        pending.current = null;
        cb?.();
      }}
      // A short static menu brings its own layout; no managed ScrollView.
      scrollable={false}
    >
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.title} numberOfLines={1}>
          @{username}
        </Text>

        <MenuRow
          icon="flag-outline"
          title="Report"
          destructive
          onPress={() => closeThen(() => {
            if (!me) {
              useAuthGate.getState().open(() => setReportOpen(true));
              return;
            }
            setReportOpen(true);
          })}
        />
        <MenuRow
          icon={blocked ? "person-add-outline" : "ban-outline"}
          title={blocked ? "Unblock" : "Block"}
          destructive={!blocked}
          onPress={() => closeThen(confirmBlock)}
        />
        <MenuRow icon="share-outline" title="Share profile" onPress={() => closeThen(shareProfile)} />
        <MenuRow icon="link-outline" title="Copy link" onPress={() => closeThen(copyLink)} />
      </View>
    </BottomSheet>

    {/* A sibling, not nested inside the menu above: closeThen + onClosed
        (see confirmBlock/shareProfile/copyLink) already guarantee the menu's
        own Modal has fully closed before `reportOpen` flips true, exactly
        the sequencing StoryViewerScreen's actions-menu-then-report sheets
        use - so this and the menu are never on screen at once despite being
        two separate top-level Modals. */}
    <ReportSheet
      visible={reportOpen}
      entityType="user"
      entityId={username}
      onClose={() => setReportOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingTop: spacing.xs },
  title: {
    fontSize: font.sm,
    fontWeight: font.weightMedium,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
