import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/** Global navigation ref so non-screen components (e.g. the auth popup overlay)
 *  can navigate without being mounted inside a navigator. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
