import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import {
  BadgeCheck, Camera, Check, ChevronLeft, ChevronRight, Clock, FileText, Globe, IdCard,
  Shield, ShieldCheck, ShieldOff, Sparkles, Store, TrendingUp, X,
  type LucideIcon,
} from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/components/Avatar";
import {
  verificationApi, BV_PLANS, planById, daysUntil, formatRenewalDate,
  type AccountCheck, type PickedFile, type PlanId,
} from "@/api/verification.api";
import {
  fetchIapConfig, iapAvailable, iapUnavailableReason, purchaseVerification,
} from "@/api/iap";
import { useAuthStore } from "@/store/auth.store";
import { sd, sr } from "./studio-design";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { usd } from "@/utils/money";

/**
 * Teezer Studio → Verification, drawn to the Claude Design prototype's
 * `studioIsVerification` panel - the LIGHT revision: a soft blue hero instead of
 * the old blue-black one, plans as full-width rows, and a numbered checklist
 * with a progress bar.
 *
 * It runs the SAME system the website does, against the same endpoints, and two
 * things about that are worth stating up front because a prototype cannot know
 * them:
 *
 *  - There are no follower or engagement thresholds. Blue Verified is a paid
 *    plan plus an identity check.
 *  - There are no verification tiers. One badge, one system.
 *
 * The server enforces the step order - each step 422s unless the draft is on the
 * previous one - so the checklist below mirrors those four gates rather than
 * inventing its own, and every row is a live entry point into the step it
 * describes.
 */

/* ── Palette ────────────────────────────────────────────────────────────────── */

/** The revision moves off Studio's near-black onto a slate scale, so these are
 *  kept local rather than pushed into the shared `sd` tokens. */
const INK = "#101828";
const BODY = "#667085";
const FAINT = "#98A2B3";
const BLUE = "#2FA0F0";
const BLUE_WASH = "#EAF3FD";
const TRACK = "#F1EFF3";
const RADIO_LINE = "#D0D5DD";

/** The two hero cards: setup is cooler and flatter, active is a touch deeper. */
const HERO_SETUP = { border: "#E6EEF7", from: "#F4F9FE" };
const HERO_ACTIVE = { border: "#DCEBF8", from: "#EFF7FE" };

/** The "live / verified" green, which is a different green from `sd.up`. */
const GREEN_WASH = "#E7F6EF";
const GREEN_DOT = "#2BC48A";
const GREEN_INK = "#1F7A5A";

/** The prototype's badge outline, lifted verbatim so the tick is the same shape
 *  here as on a profile. */
const BADGE_D =
  "M12 1.6l2.4 2 3.1-.3 1.2 2.9 2.8 1.4-.8 3 1 3-2.6 1.7-1 3-3.1.1L12 22.4l-2.9-1.9-3.1-.1-1-3-2.6-1.7 1-3-.8-3 2.8-1.4L6.4 3.3l3.1.3z";

/* ── Steps ──────────────────────────────────────────────────────────────────── */

/** Where the server says we are → which step the wizard should open on. */
function stepFromServer(step: string | null | undefined, status?: string, revoked?: boolean): number {
  // A revoked badge leaves the row at `approved` with verification_step
  // "documents_uploaded", which would drop the creator on the SUBMIT step of an
  // application they already completed. They need to start over.
  if (revoked) return 1;
  if (status === "rejected") return 1;   // restarting clears the old documents
  switch (step) {
    case "plan_selected":      return 2;
    case "account_checked":    return 3;
    case "documents_uploaded": return 4;
    default:                   return 1;
  }
}

const CHECK_ICONS: Record<string, LucideIcon> = {
  subscription:         BadgeCheck,
  profile_completeness: Sparkles,
  account_authenticity: Shield,
  community_guidelines: Shield,
  content_activity:     TrendingUp,
  public_presence:      Globe,
  identity_readiness:   IdCard,
};

/** One icon per perk slot. The perks themselves are the selected plan's real
 *  `features`, which differ per plan, so the icon goes by position. */
const PERK_ICONS: LucideIcon[] = [BadgeCheck, Shield, Sparkles, TrendingUp];

/** What actually happens after the plan is chosen - each line is a step this
 *  app really performs, in the order the server enforces. */
const VERIFY_FLOW = [
  { step: 2, title: "We check your account", sub: "Community guidelines, authenticity and how complete your profile is." },
  { step: 3, title: "You upload an ID and a selfie", sub: "A government ID, plus a selfie taken there and then with the front camera." },
  { step: 4, title: "Our team reviews it", sub: "A decision within 3-5 business days, and the tick appears on your profile." },
];

/** Three questions with answers that are true of THIS system - the re-apply one
 *  is the behaviour of `selectPlan`, which restarts a rejected application and
 *  clears its documents. */
const VERIFY_FAQ = [
  {
    q: "How long does verification take?",
    a: "Our team reviews submissions within 3-5 business days. You'll be notified as soon as a decision is made.",
  },
  {
    q: "Can I lose the badge once I have it?",
    a: "Yes. Impersonation, a community guidelines violation, or letting your Blue Verified plan lapse can all remove it.",
  },
  {
    q: "Can I apply again if I'm rejected?",
    a: "Yes. Choosing a plan again starts a fresh application and clears the documents from the rejected one.",
  },
];

/* Straight from the prototype's scan-quality list. Static copy, not data. */
const DOC_TIPS = [
  "Lay the document flat and fill the frame - all four corners visible.",
  "Good, even light. Avoid glare on laminated cards and hard shadows.",
  "Make sure the name and date of birth are readable, not blurred.",
];

/* ── Store ──────────────────────────────────────────────────────────────────── */

/**
 * Where a Blue Verified subscription is actually administered.
 *
 * It is bought with `RNIap.requestSubscription`, which makes it a STORE
 * subscription: auto-renew, the payment method and cancellation all live with
 * Apple or Google, and no endpoint of ours can change them. Sending the creator
 * to the store is the only honest destination for these buttons.
 */
const STORE_SUBSCRIPTIONS = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://play.google.com/store/account/subscriptions",
});
const STORE_RECEIPTS = Platform.select({
  ios: "https://apps.apple.com/account/billing",
  android: "https://play.google.com/store/account/orderhistory",
  default: "https://play.google.com/store/account/orderhistory",
});
const STORE_NAME = Platform.OS === "ios" ? "the App Store" : "Google Play";
const STORE_LABEL = Platform.OS === "ios" ? "App Store" : "Google Play";

function openStore(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert("Couldn't open the store", `Open ${STORE_NAME} and find Teezer under your subscriptions.`);
  });
}

/* ── Small helpers ──────────────────────────────────────────────────────────── */

/**
 * How far through the current billing period the badge is, 0-1.
 *
 * Derived from the renewal date backwards over one month, because the server
 * records when the badge next renews but not when the current period began -
 * and for a subscription that has already renewed a few times, the original
 * approval date is not the start of the period the creator is in now.
 */
function periodProgress(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const start = new Date(expiresAt);
  start.setMonth(start.getMonth() - 1);
  const span = end - start.getTime();
  if (span <= 0) return null;
  return Math.max(0, Math.min(1, (Date.now() - start.getTime()) / span));
}

/** "5 mo" / "18 days" - how long the badge has been held. */
function heldFor(since: string | null): string | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 0) return null;
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo`;
  return `${Math.floor(months / 12)} yr`;
}

/** "in 47 days" / "today" / "12 days ago" - the countdown pill. */
function renewLabel(days: number | null, lapsed: boolean): string {
  if (days === null) return lapsed ? "Expired" : "Soon";
  if (lapsed || days < 0) {
    const ago = Math.abs(days);
    return ago === 0 ? "Expired today" : `${ago}d ago`;
  }
  if (days === 0) return "Today";
  return `in ${days}d`;
}

/** "Blue Verified Plus" reads as "Plus" in a cell a third of a phone wide. */
function shortPlanName(planId?: string | null): string {
  const full = planById(planId)?.name;
  if (!full) return "Blue";
  return full.replace(/^Blue Verified\s*/i, "") || "Blue";
}

/* ── Pieces ─────────────────────────────────────────────────────────────────── */

/** The 82pt seal at the top of both hero cards. The setup variant sits on a
 *  tilted rounded square, the active one on concentric circles. */
function BadgeSeal({ active }: { active: boolean }) {
  return (
    <View style={ps.seal}>
      <View
        style={[
          ps.sealOuter,
          active
            ? { borderRadius: sr.pill }
            : { borderRadius: 26, transform: [{ rotate: "18deg" }] },
        ]}
      />
      <View
        style={[
          ps.sealInner,
          active ? { borderRadius: sr.pill, top: 9, left: 9, right: 9, bottom: 9 } : { borderRadius: 22 },
        ]}
      />
      <Svg width={active ? 44 : 42} height={active ? 44 : 42} viewBox="0 0 24 24">
        <Path d={BADGE_D} fill={BLUE} />
        <Path
          d="M8.6 12.2l2.3 2.3 4.6-4.6" stroke="#FFFFFF" strokeWidth={1.9} fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/** The white row inside the hero showing how the handle will read. */
function HandleRow({
  avatar, username, sub, chip, chipTone, border, onPress,
}: {
  avatar?: string | null;
  username?: string | null;
  sub: string;
  chip: string;
  chipTone: "outline" | "green";
  border: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[ps.handle, { borderColor: border }]} onPress={onPress}>
      {avatar ? (
        <Avatar uri={avatar} style={ps.handleAvatar} />
      ) : (
        <LinearGradient
          colors={[sd.accent, "#FF9E6E"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={ps.handleAvatar}
        >
          <Text style={ps.handleInitial}>{(username ?? "?").charAt(0).toUpperCase()}</Text>
        </LinearGradient>
      )}
      <View style={ps.handleBody}>
        <View style={ps.handleNameRow}>
          <Text style={ps.handleName} numberOfLines={1}>{username ?? "your.handle"}</Text>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d={BADGE_D} fill={BLUE} />
            <Path
              d="M8.6 12.2l2.3 2.3 4.6-4.6" stroke="#FFFFFF" strokeWidth={2.2} fill="none"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </Svg>
        </View>
        <Text style={ps.handleSub} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={[ps.handleChip, chipTone === "green" ? ps.handleChipGreen : ps.handleChipOutline]}>
        <Text style={[ps.handleChipText, chipTone === "green" && { color: GREEN_INK }]}>{chip}</Text>
      </View>
    </Pressable>
  );
}

/** The landing's accordion row - the prototype's chevron rotates rather than
 *  swapping glyph, so the closed and open states are the same control. */
function Faq({ q, a, last }: { q: string; a: string; last: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={[ps.faq, last && { borderBottomWidth: 0 }]} onPress={() => setOpen((o) => !o)}>
      <View style={ps.faqHead}>
        <Text style={ps.faqQ}>{q}</Text>
        <View style={[ps.faqChevron, open && { transform: [{ rotate: "180deg" }] }]}>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Path d="M6 9.5l6 6 6-6" stroke={sd.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          </Svg>
        </View>
      </View>
      {open && <Text style={ps.faqA}>{a}</Text>}
    </Pressable>
  );
}

/**
 * One of the three upload targets on the documents step.
 *
 * `on` means the file is accounted for - either picked in this session or
 * already held by the server from an earlier pass. Both look the same because
 * to the creator they are the same: that document is done.
 */
function UploadSlot({
  label, sub, icon: Icon, on, onPress,
}: {
  label: string; sub: string; icon: LucideIcon; on: boolean; onPress: () => void;
}) {
  return (
    <Pressable style={[ps.slot, on && ps.slotOn]} onPress={onPress}>
      <View style={[ps.slotIcon, on && { backgroundColor: BLUE_WASH }]}>
        {on ? <Check size={17} color={BLUE} strokeWidth={3} /> : <Icon size={17} color={FAINT} strokeWidth={2} />}
      </View>
      <Text style={ps.slotLabel} numberOfLines={1}>{label}</Text>
      <Text style={[ps.slotSub, on && { color: BLUE }]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────────── */

export function StudioVerificationSection() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const statusQ = useQuery({
    queryKey: ["verification-status"],
    queryFn: verificationApi.status,
    staleTime: 30_000,
  });

  const req = statusQ.data?.request ?? null;
  const isVerified = statusQ.data?.isVerified ?? false;

  const [step, setStep] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [checks, setChecks] = useState<AccountCheck[]>([]);
  const [doc, setDoc] = useState<PickedFile | null>(null);
  const [selfie, setSelfie] = useState<PickedFile | null>(null);
  const [supporting, setSupporting] = useState<PickedFile | null>(null);
  const [website, setWebsite] = useState("");

  // The server is the source of truth for progress; local `step` is only an override
  // once the user starts moving through the wizard in this session.
  const isRevoked  = req?.is_revoked ?? false;
  const serverStep = stepFromServer(req?.verification_step, req?.status, isRevoked);
  const current = step ?? serverStep;

  // Someone stepping BACK to step 1 must see the plan they already chose, not an empty
  // form - otherwise Continue looks disabled for no reason.
  const selectedPlan: PlanId | null =
    plan ?? (BV_PLANS.find((p) => p.id === req?.plan_id)?.id ?? null);

  /**
   * A plan's price, as the server states it - "$10.00", or null while the
   * status call is in flight or against a server that predates the field.
   *
   * Null rather than a fallback on purpose: the reason pricing moved off the
   * client is that a bundled number can advertise a price the store will not
   * charge, and a default here would put that straight back.
   */
  const priceOf = useCallback(
    (id: string): string | null => {
      const v = statusQ.data?.prices?.[id];
      return typeof v === "number" ? usd(v) : null;
    },
    [statusQ.data?.prices],
  );

  // Documents the server is already holding, from an earlier pass through step 3.
  const serverHasDocs = Boolean(req?.document_uploaded && req?.selfie_uploaded);
  const pickedAny = Boolean(doc || selfie || supporting);

  const goto = useCallback((n: number) => setStep(n), []);
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["verification-status"] });
  }, [qc]);

  /**
   * Prefer the FIELD error over the wrapper message.
   *
   * The API answers a 422 with `message: "Validation failed."` and the real reason under
   * `errors: { document: [...] }`. Showing only the wrapper told the user their upload
   * failed and nothing whatsoever about why.
   */
  const fail = (e: unknown, fallback: string) => {
    const res = (e as {
      response?: { data?: { message?: string; errors?: Record<string, string[]> } };
    })?.response?.data;
    const fieldError = res?.errors ? Object.values(res.errors).flat()[0] : undefined;
    Alert.alert("Verification", fieldError ?? res?.message ?? fallback);
  };

  const planM = useMutation({
    mutationFn: (id: PlanId) => verificationApi.selectPlan(id),
    onSuccess: () => { refresh(); goto(2); },
    onError: (e) => fail(e, "Couldn't select that plan."),
  });

  /**
   * Step 1's Continue.
   *
   * Changing plan is a genuine restart on the server - it clears any documents already
   * uploaded. Someone who stepped back just to re-read the plans should not lose their
   * ID scan to a stray tap, so we ask first, and only when there is actually something
   * to lose.
   */
  const continueFromPlan = useCallback(() => {
    if (!selectedPlan) return;

    const planChanged = Boolean(req?.plan_id) && req?.plan_id !== selectedPlan;
    const hasUploads = Boolean(req?.document_uploaded || req?.selfie_uploaded);

    if (planChanged && hasUploads) {
      Alert.alert(
        "Change plan?",
        "Switching plan restarts your application. The documents you've already uploaded will be removed and you'll need to upload them again.",
        [
          { text: "Keep current plan", style: "cancel" },
          { text: "Change plan", style: "destructive", onPress: () => planM.mutate(selectedPlan) },
        ],
      );
      return;
    }

    planM.mutate(selectedPlan);
  }, [selectedPlan, req?.plan_id, req?.document_uploaded, req?.selfie_uploaded, planM]);

  const checkM = useMutation({
    mutationFn: verificationApi.accountCheck,
    onSuccess: (r) => {
      setChecks(r.checks);
      refresh();
      // canProceed is false ONLY on a community-guidelines violation. Everything else
      // is advisory, so we don't block on it.
      if (!r.canProceed) {
        Alert.alert(
          "Can't continue",
          "There's an active policy violation on your account. Verification isn't available until it's resolved.",
        );
      }
    },
    onError: (e) => fail(e, "Couldn't run the account review."),
  });

  const uploadM = useMutation({
    mutationFn: () =>
      verificationApi.uploadDocuments({
        document: doc!,
        selfie: selfie!,
        supportingDoc: supporting,
        website: website.trim() || undefined,
      }),
    onSuccess: () => { refresh(); goto(4); },
    onError: (e) => fail(e, "Couldn't upload your documents."),
  });

  const submitM = useMutation({
    mutationFn: verificationApi.submit,
    onSuccess: () => {
      refresh();
      setStep(null);
      Alert.alert("Submitted", "Our team will review your application within 3-5 business days.");
    },
    onError: (e) => fail(e, "Couldn't submit your application."),
  });

  /* ── Payment ─────────────────────────────────────────────────────────────
     Blue Verified is a subscription, and the server refuses an unpaid submit (402).
     Both stores require THEIR billing for digital goods, so the app pays through Apple
     IAP / Google Play - never Stripe or PayPal, which are for the website. */

  const iapQ = useQuery({
    queryKey: ["verification-iap-config"],
    queryFn: fetchIapConfig,
    staleTime: 60_000,
  });

  const [paying, setPaying] = useState(false);

  const payThenSubmit = useCallback(async () => {
    const cfg = iapQ.data;

    if (!iapAvailable()) {
      Alert.alert("Payment unavailable", iapUnavailableReason);
      return;
    }
    if (!cfg?.enabled || !cfg.productId) {
      Alert.alert(
        "Payment unavailable",
        "In-app purchases aren't set up for your plan yet. You can complete payment on teezer.live.",
      );
      return;
    }

    setPaying(true);
    try {
      const result = await purchaseVerification(cfg.productId);
      if (!result.ok) {
        // Cancelled is not a failure worth alarming them about; anything else is.
        if (!result.cancelled) Alert.alert("Payment failed", result.message);
        return;
      }
      // Paid and verified server-side - now the submit will pass the 402 gate.
      await qc.invalidateQueries({ queryKey: ["verification-iap-config"] });
      refresh();
      submitM.mutate();
    } finally {
      setPaying(false);
    }
  }, [iapQ.data, qc, refresh, submitM]);

  const alreadyPaid = Boolean(req?.is_paid || iapQ.data?.paid);

  /** Submit → pay first if this application hasn't been paid for. */
  const submitOrPay = useCallback(() => {
    if (alreadyPaid) { submitM.mutate(); return; }
    void payThenSubmit();
  }, [alreadyPaid, submitM, payThenSubmit]);

  /**
   * Step 3's Continue. If the server already holds both documents and nothing new was
   * picked, there is nothing to upload - just move on rather than making someone
   * re-attach files that are already stored.
   */
  const continueFromDocs = useCallback(() => {
    if (!pickedAny && serverHasDocs) { goto(4); return; }
    uploadM.mutate();
  }, [pickedAny, serverHasDocs, uploadM, goto]);

  // Either both new files are attached (a fresh upload / a replacement), or the server
  // already holds them and nothing was touched.
  const canContinueDocs = (Boolean(doc) && Boolean(selfie)) || (!pickedAny && serverHasDocs);

  const blockedByGuidelines = checks.some(
    (c) => c.key === "community_guidelines" && c.status === "failed",
  );

  /** Shared tail: an ImagePicker result → the {uri, name, type} the upload wants. */
  const takeAsset = useCallback(
    (res: ImagePicker.ImagePickerResult, set: (f: PickedFile) => void, fallbackName: string) => {
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      set({
        uri: a.uri,
        // A camera capture has no fileName, so give it one - the server reads the
        // extension to decide the mime type, and a nameless part is rejected.
        name: a.fileName ?? fallbackName,
        type: a.mimeType ?? "image/jpeg",
      });
    },
    [],
  );

  /** Documents: pick from the library. An ID is a thing you already have a photo of. */
  const pick = useCallback(async (set: (f: PickedFile) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach your documents.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    takeAsset(res, set, `upload-${Date.now()}.jpg`);
  }, [takeAsset]);

  /**
   * Selfie: open the camera, front lens.
   *
   * The point of the selfie is that it is taken NOW, by the person holding the phone -
   * a liveness signal for the review team. Letting it come from the photo library
   * defeats that, so this is a capture, not a pick.
   */
  const captureSelfie = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "We need your camera to take the verification selfie. You can enable it in Settings.",
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      cameraType: ImagePicker.CameraType.front,
      quality: 0.9,
      // No editing step: a cropped or filtered selfie is worth less to a reviewer
      // checking it against a government ID.
      allowsEditing: false,
    });
    takeAsset(res, setSelfie, `selfie-${Date.now()}.jpg`);
  }, [takeAsset]);

  const renewal = useMemo(() => ({
    date: formatRenewalDate(req?.expires_at ?? null),
    days: daysUntil(req?.expires_at ?? null),
  }), [req?.expires_at]);

  const previewTap = useCallback(() => {
    Alert.alert(
      "Profile preview",
      "This is how your name reads once the badge is live - in the feed, on comments, in search and in Spaces.",
    );
  }, []);

  if (statusQ.isLoading) {
    return (
      <View style={ps.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  /* ── Verified ───────────────────────────────────────────────────────────── */
  if (isVerified) {
    const lapsed = req?.has_lapsed ?? false;
    // A staff / official badge. Not billed, no renewal - and crucially NOT the same as
    // "we have no renewal date on file", which is what a missing date alone would mean.
    const permanent = req?.is_permanent ?? false;

    const since = formatRenewalDate(req?.reviewed_at ?? null);
    const held = heldFor(req?.reviewed_at ?? null);
    const progress = permanent ? null : periodProgress(req?.expires_at ?? null);
    const price = req?.plan_price_usd;

    /* The four tiles. Every cell is measured; a figure we do not have shows a
       dash, because a blank cell in a billing card reads as a bug. */
    const meta: { label: string; value: string }[] = permanent
      ? [
          { label: "Plan", value: "Official" },
          { label: "Billing", value: "None" },
          { label: "Verified for", value: held ?? "--" },
          { label: "Renews", value: "Never" },
        ]
      : [
          { label: "Plan", value: shortPlanName(req?.plan_id) },
          { label: "Monthly", value: price == null ? "--" : usd(price) },
          { label: "Verified for", value: held ?? "--" },
          { label: "Renews", value: renewal.date ? renewLabel(renewal.days, lapsed) : "--" },
        ];

    const actions: { key: string; label: string; sub: string; icon: LucideIcon; act: () => void }[] = [
      {
        key: "sub", label: "Manage subscription", sub: `Opens ${STORE_NAME}`,
        icon: Store, act: () => openStore(STORE_SUBSCRIPTIONS),
      },
      {
        key: "receipt", label: "View receipts", sub: "Your billing history",
        icon: FileText, act: () => openStore(STORE_RECEIPTS),
      },
      {
        key: "perks", label: "What your plan includes", sub: shortPlanName(req?.plan_id),
        icon: BadgeCheck,
        act: () => {
          const p = planById(req?.plan_id);
          Alert.alert(p?.name ?? "Your plan", (p?.features ?? []).join("\n") || "No feature list available.");
        },
      },
    ];

    return (
      <ScrollView
        contentContainerStyle={ps.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={statusQ.isFetching} onRefresh={refresh} tintColor={colors.brand} />
        }
      >
        <LinearGradient
          colors={[HERO_ACTIVE.from, "#FFFFFF"]}
          locations={[0, 0.76]}
          style={[ps.hero, { borderColor: HERO_ACTIVE.border }]}
        >
          <BadgeSeal active />
          <View style={ps.heroCopy}>
            <View style={ps.livePill}>
              <View style={ps.liveDot} />
              <Text style={ps.livePillText}>{lapsed ? "LAPSED" : "VERIFIED"}</Text>
            </View>
            <Text style={ps.heroTitleActive}>{lapsed ? "Badge has lapsed" : "You're verified"}</Text>
            <Text style={ps.heroSubActive}>
              {since ? `Badge active since ${since}` : "Your badge is live"}
            </Text>
          </View>
          <HandleRow
            avatar={user?.avatar}
            username={user?.username}
            sub="Live on your profile"
            chip="LIVE"
            chipTone="green"
            border={HERO_ACTIVE.border}
            onPress={previewTap}
          />
        </LinearGradient>

        {/* ── Renewal ─────────────────────────────────────────────── */}
        {permanent ? (
          <View style={[ps.card, { marginTop: 12 }]}>
            <Text style={ps.note}>
              This badge is permanent. It doesn&apos;t expire, there&apos;s nothing to renew, and
              you&apos;re not billed for it.
            </Text>
          </View>
        ) : (
          <View style={[ps.card, { marginTop: 12, gap: 13 }]}>
            <View style={ps.renewHead}>
              <View style={ps.renewHeadLeft}>
                <Text style={ps.renewLabel}>
                  {lapsed ? "Expired on" : "Next verification renewal"}
                </Text>
                <Text style={ps.renewDate} numberOfLines={1}>
                  {renewal.date ?? "Not recorded"}
                </Text>
              </View>
              {!!renewal.date && (
                <View style={[ps.renewPill, lapsed && { backgroundColor: sd.downWash }]}>
                  <Text style={[ps.renewPillText, lapsed && { color: sd.down }]}>
                    {renewLabel(renewal.days, lapsed)}
                  </Text>
                </View>
              )}
            </View>

            {/* Only drawn when there is a date to measure against - an empty bar
                would imply a period we cannot actually see. */}
            {progress !== null && (
              <View style={ps.track}>
                <View
                  style={[
                    ps.trackFill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: lapsed ? sd.down : BLUE },
                  ]}
                />
              </View>
            )}

            <View style={ps.autoRow}>
              <View style={ps.autoBody}>
                <Text style={ps.rowTitle} numberOfLines={1}>Auto-renew</Text>
                {/* Not a switch. Blue Verified is a store subscription, so
                    auto-renew is Apple's or Google's setting and nothing here can
                    read or change it - a toggle would be inventing state and then
                    failing to honour it. */}
                <Text style={ps.rowSub} numberOfLines={1}>Managed in {STORE_NAME}</Text>
              </View>
              <Pressable style={ps.autoChip} onPress={() => openStore(STORE_SUBSCRIPTIONS)} hitSlop={6}>
                <Text style={ps.autoChipText}>Change</Text>
                <ChevronRight size={13} color={BLUE} strokeWidth={2.4} />
              </Pressable>
            </View>

            {lapsed && (
              <Text style={[ps.note, { color: sd.down }]}>
                Your Blue Verified period has ended. Renew in {STORE_NAME} to keep the badge.
              </Text>
            )}
            {!renewal.date && !lapsed && (
              // Approved before expiry tracking existed. Say so - the alternative is to
              // compute "approved + 1 month", which would be a specific, confident date
              // about someone's billing that nothing in the system actually honours.
              <Text style={ps.note}>
                This badge was approved before renewal dates were recorded, so we don&apos;t have
                one to show. It stays active until an admin changes it.
              </Text>
            )}
          </View>
        )}

        {/* ── Meta tiles ──────────────────────────────────────────── */}
        <View style={ps.tileGrid}>
          {meta.map((m) => (
            <View key={m.label} style={ps.tile}>
              <Text style={ps.tileLabel} numberOfLines={1}>{m.label}</Text>
              <Text style={ps.tileValue} numberOfLines={1}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Manage badge ────────────────────────────────────────── */}
        <Text style={ps.sectionLabel}>MANAGE BADGE</Text>
        <View style={ps.listCard}>
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <Pressable
                key={a.key}
                style={[ps.listRow, i === actions.length - 1 && { borderBottomWidth: 0 }]}
                onPress={a.act}
              >
                <View style={ps.listTile}>
                  <Icon size={16} color={BLUE} strokeWidth={2.1} />
                </View>
                <View style={ps.listBody}>
                  <Text style={ps.rowTitle} numberOfLines={1}>{a.label}</Text>
                  <Text style={ps.rowSub} numberOfLines={1}>{a.sub}</Text>
                </View>
                <ChevronRight size={15} color="#C7C2CE" strokeWidth={2.2} />
              </Pressable>
            );
          })}
        </View>

        <View style={ps.footnote}>
          <Shield size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
          <Text style={ps.footnoteText}>
            Changing your username removes the badge and needs a fresh review. The badge stays
            while your Blue Verified plan is active.
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ── Pending ────────────────────────────────────────────────────────────── */
  if (req?.status === "pending") {
    const submittedOn = formatRenewalDate(req.submitted_at);

    return (
      <ScrollView
        contentContainerStyle={ps.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={statusQ.isFetching} onRefresh={refresh} tintColor={colors.brand} />
        }
      >
        <LinearGradient
          colors={[HERO_SETUP.from, "#FFFFFF"]}
          locations={[0, 0.72]}
          style={[ps.hero, { borderColor: HERO_SETUP.border }]}
        >
          <BadgeSeal active={false} />
          <View style={ps.heroCopy}>
            <View style={[ps.livePill, { backgroundColor: "#FFF7ED" }]}>
              <View style={[ps.liveDot, { backgroundColor: colors.warning }]} />
              <Text style={[ps.livePillText, { color: "#B45309" }]}>UNDER REVIEW</Text>
            </View>
            <Text style={ps.heroTitle}>With our team</Text>
            <Text style={ps.heroSub}>
              Your application is in the review queue. Nothing else is needed from you.
            </Text>
          </View>
          <HandleRow
            avatar={user?.avatar}
            username={user?.username}
            sub="How your name will look"
            chip="PREVIEW"
            chipTone="outline"
            border={HERO_SETUP.border}
            onPress={previewTap}
          />
        </LinearGradient>

        <View style={ps.tileGrid}>
          {[
            { label: "Plan", value: shortPlanName(req.plan_id) },
            { label: "Monthly", value: priceOf(req.plan_id ?? "") ?? "--" },
            { label: "Submitted", value: submittedOn ?? "--" },
            { label: "Decision", value: "3-5 days" },
          ].map((m) => (
            <View key={m.label} style={ps.tile}>
              <Text style={ps.tileLabel} numberOfLines={1}>{m.label}</Text>
              <Text style={ps.tileValue} numberOfLines={1}>{m.value}</Text>
            </View>
          ))}
        </View>

        <Text style={ps.sectionLabel}>YOUR CHECKLIST</Text>
        <View style={[ps.card, { gap: 13 }]}>
          <View style={ps.track}><View style={[ps.trackFill, { width: "100%", backgroundColor: BLUE }]} /></View>
          {[
            { label: "Plan chosen", sub: shortPlanName(req.plan_id) },
            { label: "Account reviewed", sub: "Checks passed" },
            {
              label: "Identity confirmed",
              sub: req.supporting_doc_uploaded ? "ID, selfie and supporting document" : "ID and selfie",
            },
            { label: "Submitted for review", sub: submittedOn ? `Sent ${submittedOn}` : "Sent" },
          ].map((r) => (
            <View key={r.label} style={ps.taskRow}>
              <View style={[ps.taskNum, { backgroundColor: BLUE }]}>
                <Check size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={ps.listBody}>
                <Text style={ps.taskLabel} numberOfLines={1}>{r.label}</Text>
                <Text style={ps.rowSub} numberOfLines={1}>{r.sub}</Text>
              </View>
              <View style={[ps.chip, ps.chipDone]}>
                <Text style={[ps.chipText, { color: BLUE }]}>Done</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={ps.sectionLabel}>GOOD TO KNOW</Text>
        <View style={ps.listCard}>
          {VERIFY_FAQ.map((f, i) => (
            <Faq key={f.q} q={f.q} a={f.a} last={i === VERIFY_FAQ.length - 1} />
          ))}
        </View>

        <View style={ps.footnote}>
          <Shield size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
          <Text style={ps.footnoteText}>
            We&apos;ll notify you in the app and by email as soon as there&apos;s a decision. Your
            documents are deleted 30 days after it.
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ── Landing ────────────────────────────────────────────────────────────── */
  if (current === 1) {
    const activePlan = planById(selectedPlan) ?? BV_PLANS[0];
    const restarting = isRevoked || req?.status === "rejected";

    /* The checklist is the SERVER'S four gates, in the order it enforces them.
       The prototype's own rows - "add your real name", "link an official
       source", "enable two-factor login" - are not what this backend asks for,
       and two of them are not reachable from Studio at all, so a row per gate is
       both the honest version and the one where every row can actually go
       somewhere. */
    const tasks: { n: number; label: string; sub: string; done: boolean }[] = [
      {
        n: 1,
        label: "Choose your plan",
        sub: req?.plan_id ? shortPlanName(req.plan_id) : "Blue Verified is a subscription",
        done: Boolean(req?.plan_id) && serverStep > 1,
      },
      {
        n: 2,
        label: "Pass the account review",
        sub: "Guidelines, authenticity and profile completeness",
        done: serverStep > 2,
      },
      {
        n: 3,
        label: "Confirm your identity",
        sub: "Citizenship, licence or passport, plus a selfie",
        done: serverHasDocs,
      },
      {
        n: 4,
        label: "Subscribe and submit",
        sub: "You're charged when you submit, not before",
        done: false,
      },
    ];
    const doneCount = tasks.filter((t) => t.done).length;

    return (
      <ScrollView
        contentContainerStyle={ps.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={statusQ.isFetching} onRefresh={refresh} tintColor={colors.brand} />
        }
      >
        {/* ── Hero ────────────────────────────────────────────────── */}
        <LinearGradient
          colors={[HERO_SETUP.from, "#FFFFFF"]}
          locations={[0, 0.72]}
          style={[ps.hero, { borderColor: HERO_SETUP.border }]}
        >
          <BadgeSeal active={false} />
          <View style={ps.heroCopy}>
            <Text style={ps.heroTitle}>The blue check</Text>
            <Text style={ps.heroSub}>
              Proof it&apos;s really you. Comes with a Blue Verified plan, and stays as long as
              you&apos;re subscribed.
            </Text>
          </View>
          <HandleRow
            avatar={user?.avatar}
            username={user?.username}
            sub="How your name will look"
            chip="PREVIEW"
            chipTone="outline"
            border={HERO_SETUP.border}
            onPress={previewTap}
          />
        </LinearGradient>

        {/* A badge that was taken back, or a rejected application. Said before the
            plans - silently showing the pricing again is the most confusing
            possible response to losing a badge. */}
        {isRevoked && (
          <View style={ps.alert}>
            <ShieldOff size={15} color={sd.down} strokeWidth={2.5} />
            <View style={ps.listBody}>
              <Text style={ps.alertTitle}>Your verification badge was removed</Text>
              {!!req?.revoke_reason && <Text style={ps.alertText}>{req.revoke_reason}</Text>}
              <Text style={ps.alertText}>You can fix the issue and apply again below.</Text>
            </View>
          </View>
        )}
        {!isRevoked && req?.status === "rejected" && !!req.rejection_reason && (
          <View style={ps.alert}>
            <X size={15} color={sd.down} strokeWidth={2.5} />
            <View style={ps.listBody}>
              <Text style={ps.alertTitle}>Your last application was rejected</Text>
              <Text style={ps.alertText}>{req.rejection_reason}</Text>
              <Text style={ps.alertText}>Choosing a plan starts a fresh application.</Text>
            </View>
          </View>
        )}

        {/* ── Plans ───────────────────────────────────────────────── */}
        <Text style={ps.sectionLabel}>CHOOSE YOUR PLAN</Text>
        <View style={{ gap: 9 }}>
          {BV_PLANS.map((p) => {
            const on = selectedPlan === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPlan(p.id)}
                style={[ps.planRow, on && ps.planRowOn]}
              >
                <View style={[ps.radio, on && ps.radioOn]}>
                  {on && <Check size={11} color="#FFFFFF" strokeWidth={3.4} />}
                </View>
                <View style={ps.planBody}>
                  <View style={ps.planNameRow}>
                    {/* "Blue Verified Plus" → "Plus": the row already says which
                        product this is, and the prefix is on every plan. */}
                    <Text style={ps.planName} numberOfLines={1}>{shortPlanName(p.id)}</Text>
                    {!!p.badge && <Text style={ps.planTag} numberOfLines={1}>POPULAR</Text>}
                  </View>
                  <Text style={ps.planSub} numberOfLines={1}>{p.tagline}</Text>
                </View>
                <View style={ps.planPriceBox}>
                  {/* The server's price, never a bundled copy. A dash while it
                      loads beats a number the store might not charge. */}
                  <Text style={ps.planPrice} numberOfLines={1}>{priceOf(p.id) ?? "--"}</Text>
                  <Text style={ps.planPer} numberOfLines={1}>per month</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={ps.compare}
          onPress={() => Alert.alert(
            "Blue Verified plans",
            BV_PLANS.map((p) => `${p.name} - ${priceOf(p.id) ?? "price unavailable"}/mo\n${p.features.join("\n")}`).join("\n\n"),
          )}
        >
          <Text style={ps.compareText}>See everything else each plan includes</Text>
        </Pressable>

        {/* ── Checklist ───────────────────────────────────────────── */}
        <View style={ps.headRow}>
          <Text style={ps.sectionLabelFlush}>YOUR CHECKLIST</Text>
          <Text style={ps.headRight}>{doneCount}/{tasks.length} done</Text>
        </View>
        <View style={[ps.card, { gap: 13 }]}>
          <View style={ps.track}>
            <View style={[ps.trackFill, { width: `${(doneCount / tasks.length) * 100}%`, backgroundColor: BLUE }]} />
          </View>

          {tasks.map((t) => {
            // The server 422s any step out of order, so a future row is not a
            // shortcut - only somewhere already reached can be jumped to.
            const locked = t.n > serverStep;
            const now = t.n === serverStep;
            return (
              <Pressable
                key={t.n}
                disabled={locked}
                onPress={() => (t.n === 1 ? undefined : goto(t.n))}
                style={ps.taskRow}
              >
                <View style={[ps.taskNum, t.done ? { backgroundColor: BLUE } : { backgroundColor: TRACK }]}>
                  {t.done
                    ? <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    : <Text style={ps.taskNumText}>{t.n}</Text>}
                </View>
                <View style={ps.listBody}>
                  <Text style={ps.taskLabel} numberOfLines={1}>{t.label}</Text>
                  <Text style={ps.rowSub} numberOfLines={1}>{t.sub}</Text>
                </View>
                <View style={[ps.chip, t.done ? ps.chipDone : now ? ps.chipNow : ps.chipLater]}>
                  <Text
                    style={[
                      ps.chipText,
                      t.done ? { color: BLUE } : now ? { color: "#FFFFFF" } : { color: FAINT },
                    ]}
                  >
                    {t.done ? "Done" : now ? "Add" : "Later"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* ── Perks ───────────────────────────────────────────────── */}
        <Text style={ps.sectionLabel}>WHAT COMES WITH IT</Text>
        <View style={ps.perkGrid}>
          {activePlan.features.map((f, i) => {
            const Icon = PERK_ICONS[i % PERK_ICONS.length];
            return (
              <Pressable
                key={f}
                style={ps.perkCard}
                onPress={() => Alert.alert(activePlan.name, activePlan.features.join("\n"))}
              >
                <View style={ps.perkIcon}>
                  <Icon size={16} color={BLUE} strokeWidth={2.1} />
                </View>
                <Text style={ps.perkTitle}>{f}</Text>
                <Text style={ps.perkSub}>Included in {shortPlanName(activePlan.id)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── How it works ────────────────────────────────────────── */}
        <Text style={ps.sectionLabel}>HOW IT WORKS</Text>
        <View style={ps.card}>
          {VERIFY_FLOW.map((r, i) => (
            <Pressable
              key={r.title}
              style={ps.flowRow}
              disabled={r.step > serverStep}
              onPress={() => goto(r.step)}
            >
              <View style={ps.flowRail}>
                <View style={ps.flowDot} />
                {i < VERIFY_FLOW.length - 1 && <View style={ps.flowLine} />}
              </View>
              <View style={[ps.flowBody, i === VERIFY_FLOW.length - 1 && { paddingBottom: 0 }]}>
                <Text style={ps.rowTitle}>{r.title}</Text>
                <Text style={ps.flowSub}>{r.sub}</Text>
              </View>
              <ChevronRight size={15} color="#C7C2CE" strokeWidth={2.2} style={{ marginTop: 2 }} />
            </Pressable>
          ))}
        </View>

        {/* ── Your subscription ───────────────────────────────────────
            The prototype's billing summary, restated in this app's terms. Its
            "7 DAYS FREE" chip, trial dates and a payment method with a Change
            button describe a system we don't run: there is no trial, and for a
            digital subscription both stores require THEIR billing, so there is
            no second method to switch to. What is true is that nothing is
            charged until the application is submitted.

            Drawn only once a plan is picked - a billing card built on the
            fallback plan would quote a price the creator never chose. */}
        {!!selectedPlan && (
          <>
            <Text style={ps.sectionLabel}>YOUR SUBSCRIPTION</Text>
            <View style={[ps.card, { gap: 6 }]}>
              <View style={ps.subHead}>
                <View style={ps.subChip}>
                  <Text style={ps.subChipText}>NOTHING TO PAY YET</Text>
                </View>
                <Text style={ps.subHeadNote} numberOfLines={1}>then billed monthly</Text>
              </View>

              {[
                { label: "Plan", sub: activePlan.tagline, value: shortPlanName(selectedPlan) },
                { label: "Monthly price", sub: `Billed by ${STORE_NAME}`, value: priceOf(selectedPlan) ?? "--" },
                { label: "Renews", sub: `Until you cancel in ${STORE_NAME}`, value: "Monthly" },
              ].map((l) => (
                <View key={l.label} style={ps.subLine}>
                  <View style={ps.listBody}>
                    <Text style={ps.rowTitle} numberOfLines={1}>{l.label}</Text>
                    <Text style={ps.rowSub} numberOfLines={1}>{l.sub}</Text>
                  </View>
                  <Text style={ps.subValue} numberOfLines={1}>{l.value}</Text>
                </View>
              ))}

              <View style={ps.subDivide} />

              <View style={ps.subTotalRow}>
                <View style={ps.listBody}>
                  <Text style={ps.subTotalTitle} numberOfLines={1}>Charged when you submit</Text>
                  <Text style={ps.rowSub} numberOfLines={1}>Then every month until cancelled</Text>
                </View>
                <Text style={ps.subTotalValue}>{priceOf(selectedPlan) ?? "--"}</Text>
              </View>

              <View style={ps.payRow}>
                <View style={ps.payTile}>
                  <Store size={16} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={ps.listBody}>
                  <Text style={ps.rowTitle} numberOfLines={1}>{STORE_LABEL}</Text>
                  {/* No "Change": both stores require their own billing for a
                      digital subscription, so there is no second method to offer
                      and nothing here could switch it. */}
                  <Text style={ps.rowSub} numberOfLines={1}>Billed through {STORE_NAME}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <Text style={ps.sectionLabel}>GOOD TO KNOW</Text>
        <View style={ps.listCard}>
          {VERIFY_FAQ.map((f, i) => (
            <Faq key={f.q} q={f.q} a={f.a} last={i === VERIFY_FAQ.length - 1} />
          ))}
        </View>

        <View style={ps.footnote}>
          <Shield size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
          <Text style={ps.footnoteText}>
            Your ID is deleted 30 days after review. The badge stays while your Blue Verified
            plan is active, and Teezer never sells badges outside the app.
          </Text>
        </View>

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <Pressable
          disabled={!selectedPlan || planM.isPending}
          onPress={continueFromPlan}
          style={[ps.cta, (!selectedPlan || planM.isPending) && ps.ctaOff]}
        >
          {planM.isPending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={ps.ctaText}>{restarting ? "Start a new application" : "Continue to account review"}</Text>}
        </Pressable>
        <Text style={ps.ctaNote}>
          {selectedPlan
            ? "You'll pay when you submit, after your documents are in."
            : "Pick a plan to continue."}
        </Text>
      </ScrollView>
    );
  }

  /* ── Wizard (steps 2-4) ─────────────────────────────────────────────────── */
  const stepTitle = current === 2 ? "Account review" : current === 3 ? "Your documents" : "Review & submit";
  const stepBlurb =
    current === 2
      ? "We check your account against the verification rules. Only a community guidelines violation blocks an application - everything else is advice."
      : current === 3
        ? "A government ID and a selfie are required. Anything else is optional, and nothing here is ever shown on your profile."
        : "Everything's in place. Our team reviews your application within 3-5 business days.";

  const planPrice = priceOf(selectedPlan ?? "");

  return (
    <ScrollView
      contentContainerStyle={ps.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={statusQ.isFetching} onRefresh={refresh} tintColor={colors.brand} />
      }
    >
      {/* ── Brief ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[HERO_SETUP.from, "#FFFFFF"]}
        locations={[0, 0.72]}
        style={[ps.wizHero, { borderColor: HERO_SETUP.border }]}
      >
        <View style={ps.wizTile}>
          <ShieldCheck size={20} color={BLUE} strokeWidth={2} />
        </View>
        <Text style={ps.wizTitle}>{stepTitle}</Text>
        <Text style={ps.wizBlurb}>{stepBlurb}</Text>
      </LinearGradient>

      <View style={[ps.card, { marginTop: 12, gap: 11 }]}>
        <View style={ps.track}>
          <View style={[ps.trackFill, { width: `${((current - 1) / 4) * 100}%`, backgroundColor: BLUE }]} />
        </View>
        <View style={ps.wizMetaRow}>
          {[
            { label: "Step", value: `${current} of 4` },
            { label: "Plan", value: shortPlanName(selectedPlan) },
            { label: "Monthly", value: planPrice ?? "--" },
          ].map((k) => (
            <View key={k.label} style={ps.wizMetaCell}>
              <Text style={ps.tileValue} numberOfLines={1}>{k.value}</Text>
              <Text style={ps.tileLabel} numberOfLines={1}>{k.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Step 2 - Account review ───────────────────────────────── */}
      {current === 2 && (
        <>
          <Text style={ps.sectionLabel}>WHAT WE CHECKED</Text>
          {checks.length === 0 ? (
            <View style={ps.card}>
              <Text style={ps.footnoteText}>
                Nothing has been checked yet. Run the review and we&apos;ll tell you where you
                stand before you upload anything.
              </Text>
            </View>
          ) : (
            <View style={ps.listCard}>
              {checks.map((c, i) => {
                const Icon = CHECK_ICONS[c.key] ?? Shield;
                const failed = c.status === "failed";
                const passed = c.status === "passed" || c.status === "ready";
                const tone = failed ? sd.down : passed ? sd.up : colors.warning;
                const tint = failed ? "#FEE2E2" : passed ? "#F0FDF4" : "#FFF7ED";

                return (
                  <View key={c.key} style={[ps.listRow, i === checks.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[ps.listTile, { backgroundColor: tint }]}>
                      <Icon size={15} color={tone} strokeWidth={2.2} />
                    </View>
                    <View style={ps.listBody}>
                      <Text style={ps.rowTitle}>{c.label}</Text>
                      {!!c.detail && <Text style={ps.rowSub}>{c.detail}</Text>}
                    </View>
                    {failed
                      ? <X size={16} color={sd.down} strokeWidth={2.5} />
                      : passed
                        ? <Check size={16} color={sd.up} strokeWidth={3} />
                        : <Clock size={15} color={colors.warning} strokeWidth={2.2} />}
                  </View>
                );
              })}
            </View>
          )}

          {blockedByGuidelines && (
            <View style={[ps.alert, { marginTop: 12 }]}>
              <ShieldOff size={15} color={sd.down} strokeWidth={2.5} />
              <View style={ps.listBody}>
                <Text style={ps.alertTitle}>A guidelines strike is blocking this application</Text>
                <Text style={ps.alertText}>
                  This is the only check that can stop you applying. It has to be resolved
                  before the review can continue.
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Step 3 - Documents ────────────────────────────────────── */}
      {current === 3 && (
        <>
          <Text style={ps.sectionLabel}>UPLOAD PHOTOS</Text>
          <View style={ps.slotRow}>
            <UploadSlot
              label="Government ID"
              sub={doc ? "Attached" : req?.document_uploaded ? "On file" : "Required"}
              icon={IdCard}
              on={Boolean(doc || req?.document_uploaded)}
              onPress={() => pick(setDoc)}
            />
            <UploadSlot
              label="Selfie"
              sub={selfie ? "Taken" : req?.selfie_uploaded ? "On file" : "Required"}
              icon={Camera}
              on={Boolean(selfie || req?.selfie_uploaded)}
              onPress={captureSelfie}
            />
            <UploadSlot
              label="Supporting"
              sub={supporting ? "Attached" : req?.supporting_doc_uploaded ? "On file" : "Optional"}
              icon={FileText}
              on={Boolean(supporting || req?.supporting_doc_uploaded)}
              onPress={() => pick(setSupporting)}
            />
          </View>

          {pickedAny && !(doc && selfie) && (
            // The server requires BOTH files on an upload - it cannot patch one. So
            // swapping just the ID means re-attaching the selfie too. Say that here
            // rather than letting them hit a 422 on the button.
            <View style={[ps.alert, { marginTop: 12 }]}>
              <Clock size={15} color={colors.warning} strokeWidth={2.5} />
              <View style={ps.listBody}>
                <Text style={ps.alertTitle}>Attach both files</Text>
                <Text style={ps.alertText}>
                  Replacing a document means re-attaching your ID and your selfie together -
                  the review team needs them as a pair.
                </Text>
              </View>
            </View>
          )}

          <Text style={ps.sectionLabel}>LINK AN OFFICIAL SOURCE</Text>
          <View style={ps.field}>
            <Text style={ps.fieldLabel}>Website, news article or Wikipedia (optional)</Text>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yoursite.com"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              keyboardType="url"
              style={ps.fieldInput}
            />
          </View>

          <Text style={ps.sectionLabel}>TIPS FOR A CLEAN SCAN</Text>
          <View style={[ps.card, { gap: 12 }]}>
            {DOC_TIPS.map((t) => (
              <View key={t} style={ps.tipRow}>
                <View style={ps.tipDot}>
                  <Check size={11} color={BLUE} strokeWidth={3.2} />
                </View>
                <Text style={ps.tipText}>{t}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Step 4 - Submit ───────────────────────────────────────── */}
      {current === 4 && (
        <>
          <Text style={ps.sectionLabel}>WHAT YOU&apos;RE SUBMITTING</Text>
          <View style={ps.listCard}>
            {[
              { label: "Plan", value: shortPlanName(req?.plan_id ?? selectedPlan) },
              { label: "Billed monthly", value: planPrice ?? "--" },
              { label: "Account review", value: "Completed" },
              { label: "Government ID", value: req?.document_uploaded ? "Uploaded" : "Attached" },
              { label: "Selfie", value: req?.selfie_uploaded ? "Uploaded" : "Attached" },
              {
                label: "Supporting document",
                value: req?.supporting_doc_uploaded || supporting ? "Uploaded" : "Not provided",
              },
            ].map((r, i, arr) => (
              <View key={r.label} style={[ps.sumRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={ps.sumLabel} numberOfLines={1}>{r.label}</Text>
                <Text style={ps.sumValue} numberOfLines={1}>{r.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={ps.footnote}>
        <Shield size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
        <Text style={ps.footnoteText}>
          Documents are encrypted, seen only by the review team, and deleted 30 days after a
          decision. They are never shown on your profile.
        </Text>
      </View>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <View style={ps.ctaRow}>
        <Pressable style={ps.back} onPress={() => goto(current - 1)} accessibilityLabel="Back">
          <ChevronLeft size={19} color={INK} strokeWidth={2.2} />
        </Pressable>

        {current === 2 && (
          <Pressable
            onPress={() => (checks.length === 0 ? checkM.mutate() : goto(3))}
            disabled={checkM.isPending || blockedByGuidelines}
            style={[ps.cta, ps.ctaInRow, (checkM.isPending || blockedByGuidelines) && ps.ctaOff]}
          >
            {checkM.isPending
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={ps.ctaText}>{checks.length === 0 ? "Run account review" : "Continue to documents"}</Text>}
          </Pressable>
        )}

        {current === 3 && (
          <Pressable
            onPress={continueFromDocs}
            disabled={!canContinueDocs || uploadM.isPending}
            style={[ps.cta, ps.ctaInRow, (!canContinueDocs || uploadM.isPending) && ps.ctaOff]}
          >
            {uploadM.isPending
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={ps.ctaText}>{pickedAny ? "Upload & continue" : "Continue"}</Text>}
          </Pressable>
        )}

        {current === 4 && (
          <Pressable
            onPress={submitOrPay}
            disabled={submitM.isPending || paying}
            style={[ps.cta, ps.ctaInRow, (submitM.isPending || paying) && ps.ctaOff]}
          >
            {submitM.isPending || paying
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : (
                // The price is named on the button that spends money. A CTA that
                // opens a payment sheet is a button that lied about its own price.
                <Text style={ps.ctaText}>
                  {alreadyPaid
                    ? "Submit application"
                    : `Subscribe & submit${iapQ.data?.amountUsd ? ` · ${usd(iapQ.data.amountUsd)}` : ""}`}
                </Text>
              )}
          </Pressable>
        )}
      </View>

      {current === 4 && !alreadyPaid && (
        <Text style={ps.ctaNote}>
          {iapAvailable()
            ? "Payment is handled by the App Store / Google Play. You'll be charged when you confirm."
            : iapUnavailableReason}
        </Text>
      )}
      {current === 4 && (
        <Text style={ps.ctaNote}>
          By submitting you confirm the documents are yours and genuine. Impersonation
          permanently removes verification.
        </Text>
      )}
    </ScrollView>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */

const ps = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingTop: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl },

  /* Hero */
  hero: {
    borderWidth: 1, borderRadius: 26, alignItems: "center", gap: 15,
    paddingHorizontal: 18, paddingTop: 24, paddingBottom: 18,
  },
  seal: { width: 82, height: 82, alignItems: "center", justifyContent: "center" },
  sealOuter: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BLUE, opacity: 0.1 },
  sealInner: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, backgroundColor: BLUE, opacity: 0.14 },

  heroCopy: { alignItems: "center", gap: 7 },
  heroTitle: { fontSize: 24, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.96 },
  heroSub: { fontSize: 13, color: BODY, lineHeight: 20, textAlign: "center" },
  heroTitleActive: { fontSize: 22, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.77 },
  heroSubActive: { fontSize: 12.5, color: BODY, textAlign: "center" },

  livePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: GREEN_WASH, paddingHorizontal: 11, paddingVertical: 5, borderRadius: sr.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN_DOT },
  livePillText: { fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 1.05, color: GREEN_INK },

  /* Handle preview */
  handle: {
    width: "100%", flexDirection: "row", alignItems: "center", gap: 11, marginTop: 2,
    borderWidth: 1, backgroundColor: "#FFFFFF", borderRadius: 18,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  handleAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  handleInitial: { fontSize: 15, fontWeight: font.weightHeavy, color: "#FFFFFF", fontStyle: "italic" },
  handleBody: { flex: 1, minWidth: 0, gap: 2 },
  handleNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  handleName: { flexShrink: 1, fontSize: 13.5, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.14 },
  handleSub: { fontSize: 10.5, color: FAINT },
  handleChip: { borderRadius: sr.pill, paddingHorizontal: 8, paddingVertical: 5 },
  handleChipOutline: { borderWidth: 1, borderColor: HERO_SETUP.border },
  handleChipGreen: { backgroundColor: GREEN_WASH },
  handleChipText: { fontSize: 9, fontWeight: font.weightHeavy, letterSpacing: 0.9, color: FAINT },

  /* Alerts */
  alert: {
    flexDirection: "row", gap: 9, marginTop: 12, padding: 13,
    borderRadius: sr.card, backgroundColor: sd.downWash,
  },
  alertTitle: { fontSize: 12.5, fontWeight: font.weightHeavy, color: sd.down },
  alertText: { fontSize: 11.5, color: sd.slate, lineHeight: 16.5, marginTop: 3 },

  /* Section headings */
  sectionLabel: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, paddingTop: 26, paddingBottom: 10,
  },
  sectionLabelFlush: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted, letterSpacing: 0.72 },
  headRow: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    gap: 12, paddingTop: 26, paddingBottom: 10,
  },
  headRight: { fontSize: 11.5, fontWeight: font.weightHeavy, color: BLUE },

  /* Cards */
  card: { borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 16, backgroundColor: "#FFFFFF" },
  listCard: {
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel,
    paddingHorizontal: 16, paddingVertical: 2, backgroundColor: "#FFFFFF",
  },
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  listTile: { width: 34, height: 34, borderRadius: 11, backgroundColor: BLUE_WASH, alignItems: "center", justifyContent: "center" },
  listBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: font.weightBold, color: INK },
  rowSub: { fontSize: 11.5, color: sd.muted },
  note: { fontSize: 11.5, color: sd.muted, lineHeight: 17.25 },

  /* Plans */
  planRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: sd.line, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: "#FFFFFF",
  },
  planRowOn: { borderColor: BLUE, backgroundColor: HERO_SETUP.from },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: RADIO_LINE,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { backgroundColor: BLUE, borderColor: BLUE },
  planBody: { flex: 1, minWidth: 0, gap: 3 },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  planName: { flexShrink: 1, fontSize: 14, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.28 },
  planTag: { fontSize: 9, fontWeight: font.weightHeavy, letterSpacing: 0.6, color: sd.accent },
  planSub: { fontSize: 11.5, color: BODY },
  planPriceBox: { alignItems: "flex-end", gap: 1 },
  planPrice: { fontSize: 16, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.48 },
  planPer: { fontSize: 10, fontWeight: font.weightMedium, color: FAINT },

  compare: { paddingTop: 11 },
  compareText: { fontSize: 12, fontWeight: font.weightBold, color: sd.accent, textAlign: "center" },

  /* Progress track - shared by the checklist, the renewal card and the wizard */
  track: { height: 6, borderRadius: sr.pill, backgroundColor: TRACK, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: sr.pill },

  /* Checklist */
  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 2 },
  taskNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  taskNumText: { fontSize: 11, fontWeight: font.weightHeavy, color: FAINT },
  taskLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: INK, letterSpacing: -0.14 },
  chip: { borderRadius: sr.pill, paddingHorizontal: 11, paddingVertical: 5 },
  chipDone: { backgroundColor: BLUE_WASH },
  chipNow: { backgroundColor: INK },
  chipLater: { backgroundColor: TRACK },
  chipText: { fontSize: 11, fontWeight: font.weightBold },

  /* Perks */
  perkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  perkCard: {
    width: "48%", flexGrow: 1, gap: 8,
    borderWidth: 1, borderColor: sd.line, borderRadius: 18, padding: 14, backgroundColor: "#FFFFFF",
  },
  perkIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: BLUE_WASH, alignItems: "center", justifyContent: "center" },
  perkTitle: { fontSize: 12.5, fontWeight: font.weightBold, color: INK, lineHeight: 16.25 },
  perkSub: { fontSize: 11, color: sd.muted, lineHeight: 15.4 },

  /* How it works */
  flowRow: { flexDirection: "row", gap: 12 },
  flowRail: { width: 22, alignItems: "center" },
  flowDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE, marginTop: 4 },
  flowLine: { flex: 1, width: 2, backgroundColor: sd.divider, marginTop: 4 },
  flowBody: { flex: 1, minWidth: 0, gap: 3, paddingBottom: 16 },
  flowSub: { fontSize: 11.5, color: sd.muted, lineHeight: 16.7 },

  /* Renewal */
  renewHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  renewHeadLeft: { flex: 1, minWidth: 0, gap: 3 },
  renewLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  renewDate: { fontSize: 20, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.7 },
  renewPill: { borderRadius: sr.pill, backgroundColor: BLUE_WASH, paddingHorizontal: 10, paddingVertical: 6 },
  renewPillText: { fontSize: 10.5, fontWeight: font.weightHeavy, color: BLUE },

  autoRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 2 },
  autoBody: { flex: 1, minWidth: 0, gap: 2 },
  autoChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: sr.pill, borderWidth: 1, borderColor: HERO_ACTIVE.border,
    backgroundColor: "#FFFFFF", paddingHorizontal: 11, paddingVertical: 7,
  },
  autoChipText: { fontSize: 11.5, fontWeight: font.weightBold, color: BLUE },

  /* Meta tiles */
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingTop: 10 },
  tile: { width: "48%", flexGrow: 1, gap: 3, borderRadius: 16, backgroundColor: sd.fillSoft, paddingHorizontal: 14, paddingVertical: 13 },
  tileLabel: { fontSize: 10.5, fontWeight: font.weightMedium, color: sd.muted },
  tileValue: { fontSize: 14, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.28 },

  /* Your subscription */
  subHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 5 },
  subChip: { borderRadius: sr.pill, backgroundColor: sd.upWash, paddingHorizontal: 9, paddingVertical: 5 },
  subChipText: { fontSize: 9, fontWeight: font.weightHeavy, letterSpacing: 0.81, color: GREEN_INK },
  subHeadNote: { flex: 1, minWidth: 0, fontSize: 11.5, color: sd.muted },
  subLine: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingVertical: 8 },
  subValue: { fontSize: 13, fontWeight: font.weightBold, color: INK },
  subDivide: { height: 1, backgroundColor: sd.fill, marginVertical: 7 },
  subTotalRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 9 },
  subTotalTitle: { fontSize: 13.5, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.2 },
  subTotalValue: { fontSize: 16, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.48 },
  payRow: {
    flexDirection: "row", alignItems: "center", gap: 11,
    borderWidth: 1, borderColor: sd.line, borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 12, backgroundColor: "#FFFFFF",
  },
  payTile: { width: 34, height: 34, borderRadius: 10, backgroundColor: INK, alignItems: "center", justifyContent: "center" },

  /* FAQ */
  faq: { paddingVertical: 14, gap: 7, borderBottomWidth: 1, borderBottomColor: sd.fillSoft },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqQ: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: font.weightBold, color: INK, lineHeight: 17.6 },
  faqChevron: { width: 13, height: 13, alignItems: "center", justifyContent: "center" },
  faqA: { fontSize: 12, color: sd.muted, lineHeight: 18.6 },

  /* Footnote + CTA */
  footnote: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 20 },
  footnoteText: { flex: 1, minWidth: 0, fontSize: 11.5, color: sd.muted, lineHeight: 17.25 },

  cta: {
    height: 52, marginTop: 20, borderRadius: sr.pill, backgroundColor: BLUE,
    alignItems: "center", justifyContent: "center",
  },
  ctaInRow: { flex: 1, marginTop: 0 },
  ctaOff: { backgroundColor: TRACK },
  ctaText: { fontSize: 14.5, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.15 },
  ctaNote: { fontSize: 11.5, color: sd.muted, textAlign: "center", paddingTop: 9 },
  ctaRow: { flexDirection: "row", gap: 9, marginTop: 20 },
  back: {
    width: 52, height: 52, borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line,
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center",
  },

  /* Wizard */
  wizHero: { borderWidth: 1, borderRadius: 26, padding: 18, gap: 11 },
  wizTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: BLUE_WASH, alignItems: "center", justifyContent: "center" },
  wizTitle: { fontSize: 19, fontWeight: font.weightHeavy, color: INK, letterSpacing: -0.57 },
  wizBlurb: { fontSize: 13, color: BODY, lineHeight: 20 },
  wizMetaRow: { flexDirection: "row" },
  wizMetaCell: { flex: 1, alignItems: "center", gap: 3 },

  /* Upload slots */
  slotRow: { flexDirection: "row", gap: 9 },
  slot: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 15, paddingHorizontal: 8,
    borderRadius: 18, borderWidth: 1, borderColor: sd.line, backgroundColor: "#FFFFFF",
  },
  slotOn: { borderColor: BLUE, backgroundColor: HERO_SETUP.from },
  slotIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: sd.fillSoft, alignItems: "center", justifyContent: "center" },
  slotLabel: { fontSize: 11, fontWeight: font.weightBold, color: INK, textAlign: "center" },
  slotSub: { fontSize: 9.5, color: sd.muted, textAlign: "center" },

  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipDot: { width: 20, height: 20, borderRadius: sr.pill, backgroundColor: BLUE_WASH, alignItems: "center", justifyContent: "center", marginTop: 1 },
  tipText: { flex: 1, minWidth: 0, fontSize: 12.5, color: "#4A4653", lineHeight: 18.75 },

  field: { gap: 7 },
  fieldLabel: { fontSize: 11.5, color: sd.muted },
  fieldInput: {
    height: 46, borderRadius: 14, borderWidth: 1, borderColor: sd.line,
    backgroundColor: "#FFFFFF", paddingHorizontal: 14, fontSize: 13.5, color: INK,
  },

  /* Submit summary */
  sumRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  sumLabel: { flex: 1, minWidth: 0, fontSize: 12.5, color: sd.muted },
  sumValue: { fontSize: 12.5, fontWeight: font.weightBold, color: INK },
});
