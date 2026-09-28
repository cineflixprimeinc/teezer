import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent, type PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { useAuthStore } from "@/store/auth.store";
import { ACCENT, AccountIdentity, accountTitle } from "@/components/auth/account-ui";
import { MAX_SAVED_ACCOUNTS, type SavedAccount } from "@/utils/secure-store";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

const ROW_H = 82; // full row height incl. vertical gap - the drag grid step

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Manage Saved Accounts - remove, drag-to-reorder, rename, view info, add another,
 * or clear all. Enforces (and visualises) the 5-account cap. Reorder is a
 * dependency-free drag: rows are absolutely positioned by an Animated Y that
 * springs to each slot, and the dragged row follows the finger.
 */
export function ManageSavedAccountsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const accounts = useAuthStore((s) => s.accounts);
  const activeId = useAuthStore((s) => s.user?.id);
  const removeAccount = useAuthStore((s) => s.removeAccount);
  const removeAllAccounts = useAuthStore((s) => s.removeAllAccounts);
  const reorderAccounts = useAuthStore((s) => s.reorderAccounts);
  const renameAccount = useAuthStore((s) => s.renameAccount);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const [order, setOrder] = useState<number[]>(() => accounts.map((a) => a.id));
  const draggingRef = useRef(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // Sync local order from the store whenever the set of accounts changes (adds /
  // removes) - but never mid-drag, which would fight the gesture.
  useEffect(() => {
    if (!draggingRef.current) setOrder(accounts.map((a) => a.id));
  }, [accounts]);

  // One Animated Y per row; springs to its slot whenever the order changes.
  const ys = useRef<Record<number, Animated.Value>>({});
  const getY = (id: number) => (ys.current[id] ??= new Animated.Value(order.indexOf(id) * ROW_H));
  useEffect(() => {
    order.forEach((id, i) => {
      const y = getY(id);
      if (id === draggedId) return; // the dragged row tracks the finger
      Animated.spring(y, { toValue: i * ROW_H, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, draggedId]);

  const dragFromSlot = useRef(0);
  // Native-driven: the finger's translationY is written straight into the row's
  // Animated.Value on the UI thread (via setOffset + Animated.event), so the
  // dragged row's position never stutters even if the JS thread is busy. The
  // `listener` is the only JS-thread crossing, and it's needed here - reordering
  // the list requires the live numeric offset synchronously to decide which slot
  // the row is over, and there's no way to do that math purely on the UI thread.
  const onGesture = (id: number) => Animated.event(
    [{ nativeEvent: { translationY: getY(id) } }],
    {
      useNativeDriver: true,
      listener: (e: PanGestureHandlerGestureEvent) => {
        if (draggedId !== id) return;
        const baseY = dragFromSlot.current * ROW_H;
        const y = baseY + e.nativeEvent.translationY;
        const target = Math.max(0, Math.min(order.length - 1, Math.round(y / ROW_H)));
        const cur = order.indexOf(id);
        if (target !== cur) setOrder((o) => move(o, o.indexOf(id), target));
      },
    },
  );
  const onState = (id: number) => (e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState } = e.nativeEvent;
    if (state === State.ACTIVE) {
      draggingRef.current = true;
      dragFromSlot.current = order.indexOf(id);
      setDraggedId(id);
      // Rebase the Animated.Value so the native-driven translationY (which
      // starts back at 0 on every gesture) lands on top of the row's current
      // slot instead of resetting the row to the top of the list.
      getY(id).setOffset(dragFromSlot.current * ROW_H);
      getY(id).setValue(0);
    } else if (oldState === State.ACTIVE) {
      // Fold the offset back into the base value before the settle spring so
      // it animates from the row's actual current position, not from 0.
      getY(id).flattenOffset();
      // Settle into the final slot and persist.
      const finalIndex = order.indexOf(id);
      Animated.spring(getY(id), { toValue: finalIndex * ROW_H, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      draggingRef.current = false;
      setDraggedId(null);
      void reorderAccounts(order);
    }
  };

  // ── Row action menu (view info / rename / remove) ──
  const [menuFor, setMenuFor] = useState<SavedAccount | null>(null);
  const [renameFor, setRenameFor] = useState<SavedAccount | null>(null);

  const confirmRemove = (acc: SavedAccount) => {
    setMenuFor(null);
    Alert.alert(
      "Remove saved account?",
      `@${acc.username} will be removed from this device. You can add it again anytime by logging in.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void removeAccount(acc.id) },
      ],
    );
  };

  const confirmRemoveAll = () => {
    Alert.alert(
      "Remove all saved accounts?",
      "Every saved account will be removed from this device. This does not delete the accounts themselves.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove all", style: "destructive", onPress: () => void removeAllAccounts() },
      ],
    );
  };

  const viewInfo = (acc: SavedAccount) => {
    setMenuFor(null);
    const saved = acc.savedAt ? new Date(acc.savedAt).toLocaleDateString() : "-";
    Alert.alert(
      accountTitle(acc),
      `Username: @${acc.username}\nVerified: ${acc.is_verified ? "Yes" : "No"}\nSaved on: ${saved}${acc.id === activeId ? "\nStatus: Active on this device" : ""}`,
    );
  };

  const count = accounts.length;
  const full = count >= MAX_SAVED_ACCOUNTS;

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Accounts</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Capacity indicator (n/5) */}
      <View style={styles.capRow}>
        <Text style={styles.capText}>Saved Accounts <Text style={[styles.capCount, full && styles.capFull]}>({count}/{MAX_SAVED_ACCOUNTS})</Text></Text>
        {full && (
          <View style={styles.fullBadge}>
            <Ionicons name="checkmark-circle" size={13} color={ACCENT} />
            <Text style={styles.fullBadgeText}>Full</Text>
          </View>
        )}
      </View>
      <View style={styles.capTrack}>
        {Array.from({ length: MAX_SAVED_ACCOUNTS }).map((_, i) => (
          <View key={i} style={[styles.capSeg, i < count && styles.capSegOn]} />
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        {count === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={34} color={colors.textFaint} />
            <Text style={styles.emptyText}>No saved accounts on this device.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>Hold the handle to reorder. Tap ⋯ for options.</Text>
            <View style={[styles.list, { height: order.length * ROW_H }]}>
              {order.map((id) => {
                const acc = byId.get(id);
                if (!acc) return null;
                const dragging = draggedId === id;
                return (
                  <Animated.View
                    key={id}
                    style={[
                      styles.rowWrap,
                      { transform: [{ translateY: getY(id) }, { scale: dragging ? 1.03 : 1 }] },
                      dragging && styles.rowDragging,
                    ]}
                  >
                    <View style={styles.row}>
                      <PanGestureHandler onGestureEvent={onGesture(id)} onHandlerStateChange={onState(id)} maxPointers={1}>
                        <View style={styles.handle} hitSlop={10}>
                          <Ionicons name="reorder-three" size={24} color={colors.textFaint} />
                        </View>
                      </PanGestureHandler>
                      <AccountIdentity account={acc} active={acc.id === activeId} avatarSize={46} />
                      <Pressable hitSlop={8} onPress={() => setMenuFor(acc)} style={styles.kebab}>
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </>
        )}

        {/* Add another / remove all */}
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} onPress={() => navigation.navigate("Login")}>
          <Ionicons name="add" size={20} color={ACCENT} />
          <Text style={styles.addText}>Log in to another account</Text>
        </Pressable>

        {count > 0 && (
          <Pressable style={({ pressed }) => [styles.removeAll, pressed && styles.pressed]} onPress={confirmRemoveAll}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.removeAllText}>Remove all saved accounts</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Per-account action menu */}
      <BottomSheet visible={menuFor != null} onClose={() => setMenuFor(null)} scrollable={false}>
        <View style={[styles.menu, { paddingBottom: insets.bottom + spacing.lg }]}>
          {menuFor && (
            <View style={styles.menuHead}>
              <AccountIdentity account={menuFor} active={menuFor.id === activeId} avatarSize={42} />
            </View>
          )}
          <MenuItem icon="information-circle-outline" label="View account information" onPress={() => menuFor && viewInfo(menuFor)} />
          <MenuItem icon="create-outline" label="Rename account label" onPress={() => { const a = menuFor; setMenuFor(null); setRenameFor(a); }} />
          <MenuItem icon="trash-outline" label="Remove from this device" destructive onPress={() => menuFor && confirmRemove(menuFor)} />
        </View>
      </BottomSheet>

      {/* Rename */}
      <RenameSheet
        account={renameFor}
        onClose={() => setRenameFor(null)}
        onSave={(label) => { if (renameFor) void renameAccount(renameFor.id, label); setRenameFor(null); }}
      />
    </Screen>
  );
}

function MenuItem({ icon, label, onPress, destructive }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.text} />
      <Text style={[styles.menuItemText, destructive && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

function RenameSheet({ account, onClose, onSave }: {
  account: SavedAccount | null; onClose: () => void; onSave: (label: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  useEffect(() => { if (account) setText(account.label ?? ""); }, [account]);
  return (
    <BottomSheet visible={account != null} onClose={onClose} keyboardAvoid scrollable={false}>
      <View style={[styles.menu, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.renameTitle}>Rename account label</Text>
        <Text style={styles.renameSub}>Shown instead of the display name on this device. Leave empty to reset.</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={account ? account.name ?? account.username : "Label"}
          placeholderTextColor={colors.textFaint}
          style={styles.renameInput}
          maxLength={30}
          autoFocus
        />
        <Pressable style={({ pressed }) => [styles.renameSave, pressed && styles.pressed]} onPress={() => onSave(text)}>
          <Text style={styles.renameSaveText}>Save</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52, marginTop: spacing.lg },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  capRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  capText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  capCount: { color: colors.textMuted },
  capFull: { color: ACCENT },
  fullBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFEAF0", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  fullBadgeText: { fontSize: font.xs, fontWeight: font.weightHeavy, color: ACCENT },
  capTrack: { flexDirection: "row", gap: 5, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  capSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  capSegOn: { backgroundColor: ACCENT },

  hint: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, color: colors.textFaint },
  list: { marginHorizontal: spacing.lg, position: "relative" },
  rowWrap: { position: "absolute", left: 0, right: 0, height: ROW_H, justifyContent: "center" },
  rowDragging: { zIndex: 10, elevation: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 12, paddingHorizontal: 12,
    shadowColor: "#101828", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  handle: { width: 30, alignItems: "center", justifyContent: "center" },
  kebab: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", gap: 10, paddingVertical: spacing.xxl },
  emptyText: { fontSize: font.sm, color: colors.textMuted },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, height: 52, borderRadius: 16,
    borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed", backgroundColor: colors.white,
  },
  addText: { fontSize: font.md, fontWeight: font.weightHeavy, color: ACCENT },
  removeAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.md, height: 48 },
  removeAllText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.danger },
  pressed: { opacity: 0.6 },

  menu: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  menuHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: spacing.md, marginBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15 },
  menuItemText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  renameTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  renameSub: { marginTop: 4, fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },
  renameInput: {
    marginTop: spacing.md, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md, fontSize: font.md, color: colors.text, backgroundColor: colors.bgMuted,
  },
  renameSave: { marginTop: spacing.md, height: 52, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  renameSaveText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
});
