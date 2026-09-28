import { navigationRef } from "@/navigation/ref";
import { useAuthGate } from "@/store/auth-gate.store";

/**
 * Global entry point for the in-app policy viewer. Any screen calls
 * `openPolicy("privacy" | "terms" | "guidelines")` and the PolicyViewer
 * modal screen opens with the live website page - including from inside the
 * login/signup modals, since the viewer is itself a native-stack modal (a
 * plain RN <Modal> cannot present over a native modal on iOS).
 */

export type PolicyKey = "privacy" | "terms" | "guidelines";

export const POLICIES: Record<PolicyKey, { url: string; title: string }> = {
  privacy: { url: "https://teezer.live/privacy", title: "Privacy Policy" },
  terms: { url: "https://teezer.live/terms", title: "Terms of Service" },
  guidelines: { url: "https://teezer.live/guidelines", title: "Community Guidelines" },
};

export function openPolicy(policy: PolicyKey | { url: string; title: string }): void {
  // The guest auth-gate popup is an RN <Modal>; a native-stack modal can't
  // present while it's up, so hide it first (keep the pending action).
  if (useAuthGate.getState().visible) {
    useAuthGate.setState({ visible: false });
  }
  if (navigationRef.isReady()) {
    if (typeof policy === "string") navigationRef.navigate("PolicyViewer", { policy });
    else navigationRef.navigate("PolicyViewer", { url: policy.url, title: policy.title });
  }
}
