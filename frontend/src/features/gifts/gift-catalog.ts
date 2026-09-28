/**
 * Reelsoo virtual gift catalog - 200 animated icons.
 *
 * This file is the source of truth for icon/tier/animation; the DB `gifts` table is the
 * source of truth for money. The two are seeded from the same list (migration
 * 2026_07_13_000002) and joined on `slug` - the stable key, since ids shift if the set is
 * ever reordered. `priceUsd`/`coinValue` are mirrored here so the grid can render prices
 * without a round-trip; if they ever disagree with the API, the API wins.
 */

export type GiftTier = "basic" | "popular" | "rare" | "epic" | "legendary";

/** Matches the CSS animation baked into each SVG; kept here so the grid can label/filter by it. */
export type GiftAnim =
  | "float" | "bounce" | "pulse" | "spin" | "wiggle"
  | "sway" | "shimmer" | "glow" | "rise" | "twinkle";

export interface GiftIcon {
  id: number;
  slug: string;
  name: string;
  tier: GiftTier;
  anim: GiftAnim;
  /** Public URL of the animated SVG. */
  icon: string;
  /** Display price in USD. Mirrors gifts.cash_value. */
  priceUsd: number;
  /** What sending it costs the viewer. Mirrors gifts.coin_value. */
  coinValue: number;
}

/** [id, slug, name, tier, anim] - expanded into GiftIcon below. */
const RAW: [number, string, string, GiftTier, GiftAnim][] = [
  // ── basic (1–40) ────────────────────────────────────────────────────────
  [1, "heart-ribbon", "Heart Ribbon", "basic", "pulse"],
  [2, "gold-star", "Gold Star", "basic", "twinkle"],
  [3, "paper-plane", "Paper Plane", "basic", "float"],
  [4, "cherry-blossom", "Cherry Blossom", "basic", "sway"],
  [5, "thumbs-up", "Thumbs Up", "basic", "bounce"],
  [6, "finger-heart", "Finger Heart", "basic", "pulse"],
  [7, "heart-bubble", "Heart Bubble", "basic", "float"],
  [8, "saturn", "Saturn", "basic", "spin"],
  [9, "lollipop", "Lollipop", "basic", "wiggle"],
  [10, "ice-cream", "Ice Cream", "basic", "bounce"],
  [11, "boba-tea", "Boba Tea", "basic", "wiggle"],
  [12, "latte", "Latte", "basic", "float"],
  [13, "donut", "Donut", "basic", "bounce"],
  [14, "cake-slice", "Cake Slice", "basic", "bounce"],
  [15, "macaron", "Macaron", "basic", "wiggle"],
  [16, "pizza-slice", "Pizza Slice", "basic", "wiggle"],
  [17, "french-fries", "French Fries", "basic", "bounce"],
  [18, "hot-dog", "Hot Dog", "basic", "wiggle"],
  [19, "burger", "Burger", "basic", "bounce"],
  [20, "popcorn", "Popcorn", "basic", "bounce"],
  [21, "teddy-bear", "Teddy Bear", "basic", "sway"],
  [22, "bunny", "Bunny", "basic", "bounce"],
  [23, "shiba", "Shiba", "basic", "wiggle"],
  [24, "kitten", "Kitten", "basic", "wiggle"],
  [25, "chick", "Chick", "basic", "bounce"],
  [26, "penguin", "Penguin", "basic", "sway"],
  [27, "baby-dino", "Baby Dino", "basic", "bounce"],
  [28, "t-rex", "T-Rex", "basic", "wiggle"],
  [29, "whale", "Whale", "basic", "float"],
  [30, "octopus", "Octopus", "basic", "sway"],
  [31, "dolphin", "Dolphin", "basic", "float"],
  [32, "butterfly", "Butterfly", "basic", "float"],
  [33, "rose", "Rose", "basic", "sway"],
  [34, "sunflower", "Sunflower", "basic", "sway"],
  [35, "clover", "Clover", "basic", "wiggle"],
  [36, "starfish", "Starfish", "basic", "spin"],
  [37, "rainbow", "Rainbow", "basic", "shimmer"],
  [38, "cloud-smile", "Happy Cloud", "basic", "float"],
  [39, "crescent-moon", "Crescent Moon", "basic", "float"],
  [40, "sunny", "Sunny", "basic", "spin"],

  // ── popular (41–80) ─────────────────────────────────────────────────────
  [41, "planet-earth", "Planet Earth", "popular", "spin"],
  [42, "snow-mountain", "Snow Mountain", "popular", "float"],
  [43, "palm-island", "Palm Island", "popular", "sway"],
  [44, "camera", "Camera", "popular", "shimmer"],
  [45, "polaroid", "Polaroid", "popular", "wiggle"],
  [46, "game-controller", "Game Controller", "popular", "wiggle"],
  [47, "headphones", "Headphones", "popular", "pulse"],
  [48, "skateboard", "Skateboard", "popular", "wiggle"],
  [49, "bicycle", "Bicycle", "popular", "bounce"],
  [50, "guitar", "Guitar", "popular", "sway"],
  [51, "microphone", "Microphone", "popular", "pulse"],
  [52, "piano", "Piano", "popular", "bounce"],
  [53, "drum", "Drum", "popular", "bounce"],
  [54, "trumpet", "Trumpet", "popular", "shimmer"],
  [55, "rocket", "Rocket", "popular", "rise"],
  [56, "ufo", "UFO", "popular", "float"],
  [57, "astronaut", "Astronaut", "popular", "float"],
  [58, "crystal-ball", "Crystal Ball", "popular", "glow"],
  [59, "telescope", "Telescope", "popular", "wiggle"],
  [60, "vinyl-record", "Vinyl Record", "popular", "spin"],
  [61, "diamond", "Diamond", "popular", "shimmer"],
  [62, "crystal-shard", "Crystal Shard", "popular", "glow"],
  [63, "ring", "Ring", "popular", "shimmer"],
  [64, "crown", "Crown", "popular", "glow"],
  [65, "treasure-chest", "Treasure Chest", "popular", "wiggle"],
  [66, "money-bag", "Money Bag", "popular", "bounce"],
  [67, "cash-stack", "Cash Stack", "popular", "float"],
  [68, "gold-bar", "Gold Bar", "popular", "shimmer"],
  [69, "gold-coin", "Gold Coin", "popular", "spin"],
  [70, "credit-card", "Credit Card", "popular", "float"],
  [71, "trophy", "Trophy", "popular", "glow"],
  [72, "medal", "Medal", "popular", "sway"],
  [73, "badge", "Badge", "popular", "shimmer"],
  [74, "laurel-wreath", "Laurel Wreath", "popular", "glow"],
  [75, "star-trophy", "Star Trophy", "popular", "twinkle"],
  [76, "target", "Bullseye", "popular", "pulse"],
  [77, "hourglass", "Hourglass", "popular", "spin"],
  [78, "scroll", "Scroll", "popular", "float"],
  [79, "love-letter", "Love Letter", "popular", "pulse"],
  [80, "key", "Golden Key", "popular", "wiggle"],

  // ── rare (81–120) ───────────────────────────────────────────────────────
  [81, "red-heart", "Red Heart", "rare", "pulse"],
  [82, "balloons", "Balloons", "rare", "float"],
  [83, "gift-box", "Gift Box", "rare", "wiggle"],
  [84, "party-popper", "Party Popper", "rare", "bounce"],
  [85, "birthday-cake", "Birthday Cake", "rare", "glow"],
  [86, "cupcake", "Cupcake", "rare", "bounce"],
  [87, "soft-serve", "Soft Serve", "rare", "sway"],
  [88, "bubble-tea-deluxe", "Deluxe Bubble Tea", "rare", "wiggle"],
  [89, "glazed-donut", "Glazed Donut", "rare", "spin"],
  [90, "layer-cake", "Layer Cake", "rare", "bounce"],
  [91, "macaron-tower", "Macaron Tower", "rare", "sway"],
  [92, "pepperoni-pizza", "Pepperoni Pizza", "rare", "spin"],
  [93, "double-burger", "Double Burger", "rare", "bounce"],
  [94, "fries-deluxe", "Deluxe Fries", "rare", "wiggle"],
  [95, "chili-dog", "Chili Dog", "rare", "wiggle"],
  [96, "milkshake", "Milkshake", "rare", "sway"],
  [97, "wine-glass", "Wine Glass", "rare", "shimmer"],
  [98, "champagne-bucket", "Champagne", "rare", "glow"],
  [99, "snow-globe", "Snow Globe", "rare", "twinkle"],
  [100, "confetti-cannon", "Confetti Cannon", "rare", "bounce"],
  [101, "taxi", "Taxi", "rare", "bounce"],
  [102, "helicopter", "Helicopter", "rare", "spin"],
  [103, "yacht", "Yacht", "rare", "sway"],
  [104, "house", "House", "rare", "float"],
  [105, "castle", "Castle", "rare", "glow"],
  [106, "tour-bus", "Tour Bus", "rare", "bounce"],
  [107, "hot-air-balloon", "Hot Air Balloon", "rare", "float"],
  [108, "ferris-wheel", "Ferris Wheel", "rare", "spin"],
  [109, "ring-box", "Ring Box", "rare", "glow"],
  [110, "red-heels", "Red Heels", "rare", "wiggle"],
  [111, "perfume", "Perfume", "rare", "shimmer"],
  [112, "luxury-watch", "Luxury Watch", "rare", "shimmer"],
  [113, "sunglasses", "Sunglasses", "rare", "shimmer"],
  [114, "handbag", "Handbag", "rare", "sway"],
  [115, "tuxedo", "Tuxedo", "rare", "float"],
  [116, "flame", "Flame", "rare", "rise"],
  [117, "broken-heart", "Broken Heart", "rare", "wiggle"],
  [118, "heart-lock", "Heart Lock", "rare", "glow"],
  [119, "love-potion", "Love Potion", "rare", "glow"],
  [120, "magic-mirror", "Magic Mirror", "rare", "shimmer"],

  // ── epic (121–160) ──────────────────────────────────────────────────────
  [121, "sakura-tree", "Sakura Tree", "epic", "sway"],
  [122, "crystal-tree", "Crystal Tree", "epic", "glow"],
  [123, "golden-deer", "Golden Deer", "epic", "glow"],
  [124, "arctic-fox", "Arctic Fox", "epic", "float"],
  [125, "phoenix", "Phoenix", "epic", "rise"],
  [126, "portal", "Portal", "epic", "spin"],
  [127, "oasis", "Oasis", "epic", "sway"],
  [128, "waterfall", "Waterfall", "epic", "shimmer"],
  [129, "galaxy", "Galaxy", "epic", "spin"],
  [130, "thunderbolt", "Thunderbolt", "epic", "glow"],
  [131, "storm-cloud", "Storm Cloud", "epic", "float"],
  [132, "prism-heart", "Prism Heart", "epic", "shimmer"],
  [133, "amethyst-cluster", "Amethyst Cluster", "epic", "glow"],
  [134, "spellbook", "Spellbook", "epic", "glow"],
  [135, "arcane-rune", "Arcane Rune", "epic", "spin"],
  [136, "enchanted-blade", "Enchanted Blade", "epic", "shimmer"],
  [137, "aegis-shield", "Aegis Shield", "epic", "pulse"],
  [138, "faberge-egg", "Fabergé Egg", "epic", "glow"],
  [139, "ancient-map", "Ancient Map", "epic", "float"],
  [140, "wishing-well", "Wishing Well", "epic", "twinkle"],
  [141, "sky-castle", "Sky Castle", "epic", "float"],
  [142, "floating-isle", "Floating Isle", "epic", "float"],
  [143, "star-whale", "Star Whale", "epic", "float"],
  [144, "cosmic-whale", "Cosmic Whale", "epic", "glow"],
  [145, "world-tree", "World Tree", "epic", "glow"],
  [146, "aurora", "Aurora", "epic", "shimmer"],
  [147, "crystal-palace", "Crystal Palace", "epic", "glow"],
  [148, "golden-tree", "Golden Tree", "epic", "shimmer"],
  [149, "angel-wings", "Angel Wings", "epic", "rise"],
  [150, "dark-wings", "Dark Wings", "epic", "rise"],
  [151, "lion-king", "Lion King", "epic", "glow"],
  [152, "white-tiger", "White Tiger", "epic", "pulse"],
  [153, "stallion", "Stallion", "epic", "rise"],
  [154, "pegasus", "Pegasus", "epic", "rise"],
  [155, "unicorn", "Unicorn", "epic", "glow"],
  [156, "panther", "Panther", "epic", "float"],
  [157, "owl-sage", "Owl Sage", "epic", "glow"],
  [158, "panda", "Panda", "epic", "bounce"],
  [159, "corgi", "Corgi", "epic", "bounce"],
  [160, "fenrir", "Fenrir", "epic", "glow"],

  // ── legendary (161–200) ─────────────────────────────────────────────────
  [161, "rose-heart", "Rose Heart", "legendary", "pulse"],
  [162, "rose-bouquet", "Rose Bouquet", "legendary", "sway"],
  [163, "jewel-cake", "Jewel Cake", "legendary", "twinkle"],
  [164, "eternal-rose", "Eternal Rose", "legendary", "glow"],
  [165, "giant-teddy", "Giant Teddy", "legendary", "sway"],
  [166, "chocolate-box", "Chocolate Box", "legendary", "glow"],
  [167, "wedding-cake", "Wedding Cake", "legendary", "twinkle"],
  [168, "carriage", "Royal Carriage", "legendary", "float"],
  [169, "royal-crown", "Royal Crown", "legendary", "glow"],
  [170, "scepter", "Scepter", "legendary", "shimmer"],
  [171, "fairy-castle", "Fairy Castle", "legendary", "glow"],
  [172, "crystal-fountain", "Crystal Fountain", "legendary", "shimmer"],
  [173, "diamond-stage", "Diamond Stage", "legendary", "glow"],
  [174, "star-stage", "Star Stage", "legendary", "twinkle"],
  [175, "disco-orb", "Disco Orb", "legendary", "spin"],
  [176, "red-carpet", "Red Carpet", "legendary", "shimmer"],
  [177, "firework-show", "Firework Show", "legendary", "twinkle"],
  [178, "grand-finale", "Grand Finale", "legendary", "glow"],
  [179, "mega-yacht", "Mega Yacht", "legendary", "sway"],
  [180, "private-jet", "Private Jet", "legendary", "rise"],
  [181, "golden-vault", "Golden Vault", "legendary", "glow"],
  [182, "dragon-hoard", "Dragon Hoard", "legendary", "shimmer"],
  [183, "gold-dragon", "Gold Dragon", "legendary", "float"],
  [184, "fire-dragon", "Fire Dragon", "legendary", "rise"],
  [185, "ice-dragon", "Ice Dragon", "legendary", "float"],
  [186, "serpent-god", "Serpent God", "legendary", "glow"],
  [187, "guardian-lion", "Guardian Lion", "legendary", "glow"],
  [188, "mecha-titan", "Mecha Titan", "legendary", "pulse"],
  [189, "neon-city", "Neon City", "legendary", "shimmer"],
  [190, "hypercar", "Hypercar", "legendary", "rise"],
  [191, "superbike", "Superbike", "legendary", "rise"],
  [192, "time-portal", "Time Portal", "legendary", "spin"],
  [193, "black-hole", "Black Hole", "legendary", "spin"],
  [194, "nebula-orb", "Nebula Orb", "legendary", "glow"],
  [195, "cosmos", "Cosmos", "legendary", "spin"],
  [196, "phoenix-rebirth", "Phoenix Rebirth", "legendary", "rise"],
  [197, "immortal-rose", "Immortal Rose", "legendary", "glow"],
  [198, "infinity-heart", "Infinity Heart", "legendary", "pulse"],
  [199, "king-crown", "King's Crown", "legendary", "glow"],
  [200, "reelsoo-throne", "Teezer Throne", "legendary", "glow"],
];

/**
 * USD price per gift, indexed by `id - 1`. Mirrors gifts.cash_value as seeded by
 * migration 2026_07_13_000002 - the DB is authoritative; this exists so the grid can
 * price gifts without a round-trip. The ladder is not strictly ascending (there are
 * deliberate ties and a few dips), so never sort by price - sort by `id`.
 */
const PRICE_USD: number[] = [
  0.19, 0.23, 0.29, 0.35, 0.39, 0.45, 0.49, 0.55, 0.59, 0.69,
  0.79, 0.79, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99,
  1.19, 1.29, 1.39, 1.49, 1.59, 1.69, 1.79, 1.89, 2.09, 2.19,
  2.19, 2.29, 2.39, 2.49, 2.59, 2.79, 2.79, 2.79, 2.99, 2.99,
  3.49, 3.59, 3.69, 3.79, 3.89, 3.99, 4.19, 4.29, 4.39, 4.39,
  4.49, 4.69, 4.79, 4.89, 4.99, 5.19, 5.19, 5.59, 5.59, 5.99,
  6.99, 7.19, 7.79, 7.79, 8.19, 8.19, 8.39, 8.59, 8.79, 8.19,
  9.39, 9.59, 9.79, 9.99, 9.99, 9.99, 9.99, 9.99, 9.99, 9.99,
  10.99, 11.39, 11.59, 11.79, 11.19, 12.19, 12.39, 12.99, 12.19, 13.39,
  13.39, 13.79, 13.59, 13.79, 14.99, 14.19, 14.69, 14.99, 14.99, 14.99,
  15.99, 16.49, 16.99, 17.49, 17.49, 18.49, 18.49, 19.99, 20.99, 20.99,
  20.99, 21.49, 21.99, 22.49, 22.99, 23.49, 23.99, 24.49, 24.99, 24.99,
  25.99, 26.99, 27.99, 28.99, 29.99, 30.99, 32.99, 32.99, 33.99, 34.99,
  35.99, 36.99, 37.99, 39.99, 39.99, 39.99, 39.99, 39.99, 39.99, 39.99,
  49.99, 51.99, 53.99, 55.99, 57.99, 59.99, 61.99, 63.99, 65.99, 67.99,
  69.99, 71.99, 75.99, 77.99, 79.99, 79.99, 79.99, 79.99, 79.99, 79.99,
  99.99, 104.99, 109.99, 114.99, 124.99, 124.99, 129.99, 134.99, 139.99, 149.99,
  149.99, 149.99, 149.99, 149.99, 149.99, 199.99, 219.99, 239.99, 239.99, 299.99,
  399.99, 419.99, 439.99, 459.99, 479.99, 499.99, 519.99, 539.99, 559.99, 579.99,
  599.99, 599.99, 699.99, 749.99, 849.99, 899.99, 899.99, 899.99, 1599.99, 2000.0,
];

/**
 * What a dollar buys in coins, ramped 80 -> 100 across the price ladder (migration
 * 2026_07_13_000006). Fewer coins per dollar is where the platform's margin lives: a
 * gifted coin withdraws at 100 RC = $1 less 30% commission, so it costs $0.007 to honor.
 * The cheap, high-volume gifts sell at ~80/$ (~45% margin); the largest sell at 100/$ (30%).
 *
 * This must stay in lockstep with the migration - it is the same formula, and the server's
 * coin_value is authoritative if they ever disagree.
 */
const COINS_LO = 80;
const COINS_HI = 100;
const LOG_MIN = Math.log10(0.19);
const LOG_MAX = Math.log10(2000);

function coinsFor(price: number): number {
  const t = Math.min(1, Math.max(0, (Math.log10(price) - LOG_MIN) / (LOG_MAX - LOG_MIN)));
  return Math.max(1, Math.round(price * (COINS_LO + (COINS_HI - COINS_LO) * t)));
}

export const GIFTS: GiftIcon[] = RAW.map(([id, slug, name, tier, anim]) => ({
  id,
  slug,
  name,
  tier,
  anim,
  icon: `/gifts/${String(id).padStart(3, "0")}-${slug}.svg`,
  priceUsd: PRICE_USD[id - 1],
  coinValue: coinsFor(PRICE_USD[id - 1]),
}));

export const GIFT_TIERS: { id: GiftTier; label: string; accent: string }[] = [
  { id: "basic", label: "Basic", accent: "#94a3b8" },
  { id: "popular", label: "Popular", accent: "#38bdf8" },
  { id: "rare", label: "Rare", accent: "#a855f7" },
  { id: "epic", label: "Epic", accent: "#f472b6" },
  { id: "legendary", label: "Legendary", accent: "#fbbf24" },
];

export const giftBySlug = (slug: string): GiftIcon | undefined =>
  GIFTS.find((g) => g.slug === slug);
