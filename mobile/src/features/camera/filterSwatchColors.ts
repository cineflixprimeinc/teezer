/**
 * One flat swatch colour per filter category, standing in for a real
 * per-filter thumbnail image in the camera's filter carousel - rendering 27
 * live-filtered thumbnails through Skia just to browse the carousel is
 * exactly the "don't load every filter simultaneously" cost the performance
 * goals warn against.
 *
 * Shared by the Post camera and the Story camera (both use the same
 * FilterCarousel over the same CAMERA_FILTER_LIST) so the two screens can't
 * drift into showing different colours for the same category.
 */
export const FILTER_CATEGORY_COLOR: Record<string, string> = {
  Essentials: "#8A8592",
  Vintage: "#D99B72",
  Cinematic: "#3B82F6",
  Mono: "#4B5563",
  Scene: "#F97316",
  Pro: "#A78BFA",
};
