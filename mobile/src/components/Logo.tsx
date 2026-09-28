import { Image } from "react-native";

/**
 * The real Teezer site logo (src/assets/logo.png = public/teezer-logo.png).
 * Rendered small + centered per the auth designs. Swap the asset to change it.
 */
export function Logo({ height = 34 }: { height?: number }) {
  // Source logo is ~210×54 (≈3.9:1).
  return (
    <Image
      source={require("../assets/logo.png")}
      style={{ height, width: height * 3.9, resizeMode: "contain" }}
    />
  );
}
