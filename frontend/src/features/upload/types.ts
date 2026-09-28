export type Visibility  = "public" | "private" | "unlisted" | "";
export type Audience    = "everyone" | "friends" | "only_me" | "";
export type MediaType   = "video" | "image" | "image_carousel";

export type UploadFormState = {
  title:       string;
  description: string;
  hashtags:    string[];
  audience:    Audience;
  category:    string;
  visibility:  Visibility;
  scheduled:   boolean;
  allowComments:  boolean;
  allowDuet:      boolean;
  allowRemix:     boolean;
  soundLabel:     string;
  isAiGenerated:  boolean;
  /** Real, server-persisted legal attestations (server's rights_confirmed/
   *  consent_confirmed columns) - required to publish, same gate the app's
   *  own Media & safety page enforces. */
  rightsConfirmed:  boolean;
  consentConfirmed: boolean;
};

export type VideoProbe = {
  duration: number;
  width:    number;
  height:   number;
};

export const initialFormState: UploadFormState = {
  title:       "",
  description: "",
  hashtags:    [],
  audience:    "everyone",
  category:    "",
  visibility:  "public",
  scheduled:   false,
  allowComments:  true,
  allowDuet:      true,
  allowRemix:     true,
  soundLabel:     "Original Track",
  isAiGenerated:  false,
  // ON for every new upload, per product decision. The form is one page-level
  // state merged with setForm(prev => ({...prev, ...p})), so this is only ever
  // the NEW-upload default: navigating between steps merges rather than
  // replaces, and editing an existing upload overwrites it from the server -
  // neither path resets it back to this value.
  rightsConfirmed:  true,
  consentConfirmed: true,
};

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 300;
export const HASHTAGS_MAX = 10;

export const CATEGORY_OPTIONS = [
  "Comedy",
  "Dance",
  "Music",
  "Travel & Nature",
  "Food",
  "Fashion",
  "Beauty",
  "Lifestyle",
  "Fitness",
  "Sports",
  "Gaming",
  "Education",
  "Technology",
  "Business",
  "Motivation",
  "News",
  "Entertainment",
  "Vlog",
  "Art",
  "Photography",
  "Animals & Pets",
  "Nature",
  "Cars & Bikes",
  "Health",
  "DIY & Crafts",
  "Family",
  "Relationships",
  "Cooking",
  "Reviews",
  "Tutorials",
  "Religious / Spiritual",
  "Other",
] as const;
