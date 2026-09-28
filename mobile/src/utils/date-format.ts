const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Date formatting that cannot throw.
 *
 * `date.toLocaleDateString(undefined, { month: "long", ... })` is not safe on
 * this stack. Hermes only bundles a full Intl implementation on Android; on iOS
 * the options object is at best ignored and, depending on the engine build, an
 * unsupported option raises a RangeError. In a dev build that surfaces in
 * LogBox and is dismissed; in a release build React Native treats it as fatal
 * and aborts the process - which is why these screens "worked in Expo Go" and
 * crashed in TestFlight.
 *
 * It is also why the crash appeared at the moment it did on the birthday step:
 * the formatted date is only rendered once a date has been picked, so choosing
 * one is what triggered it.
 *
 * These format by hand instead. The output is English-only, which is a real
 * loss against a working Intl - but the alternative on the platform we actually
 * ship is not localised dates, it is a terminated app.
 */

/** Anything unparseable returns "" rather than "Invalid Date" or a throw. */
function parse(value?: string | number | Date | null): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "8 January 2022" style, spelled out: `January 8, 2022`. */
export function formatDateLong(value?: string | number | Date | null): string {
  const d = parse(value);
  if (!d) return "";
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Compact: `8 Jan 2022`. */
export function formatDateShort(value?: string | number | Date | null): string {
  const d = parse(value);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** `14:05` - 24-hour, so no locale-dependent AM/PM table is needed. */
export function formatTime(value?: string | number | Date | null): string {
  const d = parse(value);
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** `8 Jan 2022, 14:05`. */
export function formatDateTime(value?: string | number | Date | null): string {
  const d = parse(value);
  if (!d) return "";
  return `${formatDateShort(d)}, ${formatTime(d)}`;
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `Mon` - the weekday alone, for "within the last week" timestamps. */
export function formatWeekdayShort(value?: string | number | Date | null): string {
  const d = parse(value);
  return d ? DAYS_SHORT[d.getDay()] : "";
}

/** `Monday`. */
export function formatWeekdayLong(value?: string | number | Date | null): string {
  const d = parse(value);
  return d ? DAYS_LONG[d.getDay()] : "";
}

/** `8 Jan` - day and short month, no year, for recent-but-not-this-week rows. */
export function formatDayMonth(value?: string | number | Date | null): string {
  const d = parse(value);
  return d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` : "";
}

/** `Jan 8` - the same two parts the other way round, matching call sites that
 *  asked for { month: "short", day: "numeric" }. */
export function formatMonthDay(value?: string | number | Date | null): string {
  const d = parse(value);
  return d ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : "";
}

/**
 * `2:05 pm` - 12-hour, matching the { hour: "numeric", minute: "2-digit" }
 * call sites this replaces. Written out rather than delegated because that is
 * exactly the option combination that is unsafe here.
 */
export function formatClock12(value?: string | number | Date | null): string {
  const d = parse(value);
  if (!d) return "";
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
