import * as LocalAuthentication from "expo-local-authentication";

/**
 * Confirm with Face ID / Touch ID / device biometric (or the device
 * passcode, which `authenticateAsync` falls back to automatically when
 * biometrics fail or aren't the enrolled method) before a sensitive local
 * action - currently just switching between saved accounts, where tokens for
 * up to 5 accounts sit decrypted-at-rest in the Keychain/Keystore and a
 * single tap used to be enough to pivot into any of them.
 *
 * Returns true when there's nothing to gate with at all (no biometric
 * hardware, nothing enrolled) - the device itself has no lock to check
 * against, so refusing to proceed would only lock legitimate users out
 * without adding any real protection. Returns false only when a real prompt
 * was shown and the person failed or cancelled it.
 */
export async function confirmWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware || !isEnrolled) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    // A broken biometric check must not itself lock someone out of their
    // own device - treat it the same as "nothing to gate with."
    return true;
  }
}
