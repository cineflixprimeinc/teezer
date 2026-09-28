import Constants from "expo-constants";

type Extra = {
  appEnv: "development" | "staging" | "production";
  apiBaseUrl: string;
  mediaBaseUrl: string;
  centrifugoUrl: string;
  appName: string;
  googleWebClientId: string;
  googleIosClientId: string;
  klipyKey: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config = {
  appEnv: extra.appEnv ?? "development",
  apiBaseUrl: extra.apiBaseUrl ?? "https://api.teezer.live/api/v1",
  mediaBaseUrl: extra.mediaBaseUrl ?? "https://cdn.teezer.live",
  // Centrifugo realtime engine (WebSocket) - presence/typing + WebRTC call signaling.
  centrifugoUrl: extra.centrifugoUrl ?? "wss://realtime.teezer.live/connection/websocket",
  appName: extra.appName ?? "Teezer",
  googleWebClientId: extra.googleWebClientId ?? "",
  googleIosClientId: extra.googleIosClientId ?? "",
  // Klipy powers the comment GIF picker (app "reelsoogifkey"). The key travels
  // in the URL PATH, not a header, so it is a client key by design - it ships
  // in the bundle and is extractable, the same way Giphy/Tenor keys are. That
  // makes it non-secret at runtime, but it is still billed to our account, so
  // it comes from EXPO_PUBLIC_KLIPY_KEY rather than being committed to git.
  klipyKey: process.env.EXPO_PUBLIC_KLIPY_KEY ?? extra.klipyKey ?? "",
  // Sent on every request so the backend can bypass web-only Turnstile (decision D3).
  clientHeader: "reelsoo-mobile",
} as const;

export const isDev = config.appEnv === "development";
