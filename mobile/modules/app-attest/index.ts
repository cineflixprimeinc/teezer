import { requireOptionalNativeModule } from "expo";

/**
 * Raw bridge to the native App Attest module. Nothing outside
 * src/services/app-attest.ts should import this - that file owns the key
 * lifecycle, persistence and retry policy, and using the bridge directly
 * bypasses all of it.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: the module
 * genuinely is absent on Android, in Expo Go and in any build made before it
 * existed, and absent must mean "no attestation" rather than a throw at import
 * time - this is imported during app startup.
 */
export type AppAttestNativeModule = {
  /** False on simulators, pre-A12 devices, and anything not iOS. */
  isSupported(): boolean;
  /** Creates a Secure Enclave key; resolves its opaque identifier. */
  generateKey(): Promise<string>;
  /** base64 CBOR attestation for a server challenge. */
  attestKey(keyId: string, challenge: string): Promise<string>;
  /** base64 CBOR assertion over request-bound client data. */
  generateAssertion(keyId: string, clientData: string): Promise<string>;
};

export const AppAttestNative =
  requireOptionalNativeModule<AppAttestNativeModule>("ReelsooAppAttest");
