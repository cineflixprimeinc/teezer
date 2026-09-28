import { api } from "./api";

export interface AccessibilityPrefs {
  larger_text:         boolean;
  text_size:           "small" | "medium" | "large" | "xlarge";
  high_contrast:       boolean;
  reduce_transparency: boolean;
  reduce_motion:       boolean;
  autoplay_videos:     boolean;
  pointer_size:        "default" | "large" | "xlarge";
  captions_always_on:  boolean;
  caption_style:       "default" | "large_text" | "high_contrast" | "yellow_black";
  audio_descriptions:  boolean;
  keyboard_navigation: boolean;
  screen_reader:       boolean;
}

export const DEFAULT_A11Y: AccessibilityPrefs = {
  larger_text: false,    text_size: "small",
  high_contrast: false,  reduce_transparency: false,
  reduce_motion: false,  autoplay_videos: true,
  pointer_size: "default",
  captions_always_on: false, caption_style: "default",
  audio_descriptions: false,
  // Opt-in: the "prominent focus ring" (3px brand outline on :focus-visible) is a
  // keyboard-navigation aid. Defaulting it ON drew a loud pink ring for everyone
  // - including mouse users clicking a text field, since inputs match
  // :focus-visible on click. Off by default; keyboard users can enable it in
  // Accessibility settings. Native browser focus outlines still apply when off.
  keyboard_navigation: false, screen_reader: false,
};

export const accessibilityService = {
  async get(): Promise<AccessibilityPrefs> {
    const { data } = await api.get("/profile/accessibility");
    return data.data;
  },
  async save(prefs: AccessibilityPrefs): Promise<AccessibilityPrefs> {
    const { data } = await api.patch("/profile/accessibility", prefs);
    return data.data;
  },
};
