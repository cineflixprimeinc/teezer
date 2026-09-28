/** Shared constants + formatters for the Profile Information field editors. */

export const NAME_MAX = 20;      // website rule
export const USERNAME_MAX = 25;  // website rule
export const USERNAME_MIN = 3;
export const BIO_MAX = 150;      // website rule
export const CATEGORY_MAX = 3;   // website rule

export const GENDERS: { value: string; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
export const genderLabel = (g?: string | null) => GENDERS.find((x) => x.value === g)?.label ?? "";

/**
 * Selectable profile categories - the EXACT website list
 * (frontend account-settings PROFILE_CATEGORIES), max 3 selectable.
 */
export const CATEGORIES = [
  // Content / Creator
  "Creator", "Vlogger", "Blogger", "Podcaster", "Streamer", "Influencer",
  // Entertainment
  "Music", "Singer", "Musician", "Dance", "Choreography", "Comedy", "Acting",
  "Drama", "Memes", "Movies", "Animation", "Voice Over",
  // Visual Arts
  "Photography", "Videography", "Cinematography", "Art", "Painting",
  "Illustration", "Design", "Graphic Design", "Animation Artist",
  // Lifestyle
  "Lifestyle", "Fashion", "Beauty", "Makeup", "Skincare", "Hair", "Nails",
  "Streetwear", "Modeling",
  // Food
  "Food", "Cooking", "Baking", "Recipes", "Restaurant Reviews", "Street Food",
  "Mixology",
  // Travel & Outdoors
  "Travel", "Adventure", "Backpacking", "Camping", "Road Trips", "Outdoors",
  "Hiking", "Mountaineering",
  // Sports & Fitness
  "Fitness", "Gym", "Yoga", "Pilates", "Football", "Basketball", "Cricket",
  "Martial Arts", "Boxing", "Running", "Cycling", "Skating", "Surfing",
  // Gaming
  "Gaming", "Esports", "Streamer (Gaming)", "Game Reviews", "Speedrunner",
  // Tech & Science
  "Technology", "AI & ML", "Coding", "Web Development", "Mobile Apps", "Gadgets",
  "Cybersecurity", "Web3", "Crypto", "Science", "Astronomy", "Robotics",
  // Education & Books
  "Education", "Teacher", "Tutoring", "Languages", "Books", "Writing",
  "Poetry", "History",
  // Business & Finance
  "Business", "Entrepreneurship", "Startup", "Marketing", "Branding", "Sales",
  "Finance", "Investing", "Stock Market", "Real Estate",
  // Health & Wellness
  "Health", "Mental Health", "Meditation", "Wellness", "Nutrition",
  "Therapy", "Parenting",
  // Cars / Bikes
  "Cars", "Bikes", "Motorsports", "Auto Reviews",
  // Nature / Animals
  "Animals & Pets", "Pet Care", "Dog Training", "Wildlife", "Nature",
  "Environment", "Gardening", "Farming",
  // DIY / Crafts
  "DIY & Crafts", "Home Improvement", "Woodworking", "Crochet", "Pottery",
  // Reviews / Tutorials
  "Reviews", "Product Reviews", "Tutorials", "How-To", "Tips & Tricks",
  // Spiritual
  "Religious / Spiritual", "Astrology", "Tarot",
  // News / Politics
  "News", "Politics", "Current Affairs",
  // Other
  "Charity", "Activism", "Other",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1998-05-12" → "12 May 1998". */
export function formatDOB(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

export const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;
