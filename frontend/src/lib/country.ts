import type { TeezerUser } from "@/types/user";

const nameToCode: Record<string, string> = {
  nepal: "NP",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  india: "IN",
};

export function detectUserCountry(user: TeezerUser | null) {
  if (!user) return { code: null, name: null };

  const selectedCode = user.selected_country_code || null;
  const selectedName = user.selected_country_name || null;
  if (selectedCode || selectedName) {
    return {
      code: selectedCode?.toUpperCase() || countryNameToCode(selectedName),
      name: selectedName || user.country || null,
    };
  }

  if (user.country) {
    return { code: countryNameToCode(user.country), name: user.country };
  }

  if (user.detected_country_code || user.detected_country_name) {
    return {
      code: user.detected_country_code?.toUpperCase() || countryNameToCode(user.detected_country_name),
      name: user.detected_country_name || null,
    };
  }

  return { code: null, name: null };
}

function countryNameToCode(name?: string | null) {
  if (!name) return null;
  return nameToCode[name.trim().toLowerCase()] || null;
}
