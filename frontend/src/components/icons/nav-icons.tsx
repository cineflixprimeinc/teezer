import type { SVGProps } from "react";

/**
 * Custom solid/filled nav-icon set (fill="currentColor", no stroke) for the
 * sidebar's five core items (For You, Explore, Upload, Messages, Profile) -
 * supplied SVGs, swapped in for the lucide-react outline icons those items
 * used before. Same call signature as a lucide icon component
 * (`<Icon className="..." strokeWidth={2.5} />` - see app-shell.tsx), so
 * they drop into mainNav's existing `icon:` slot with no other changes;
 * strokeWidth is accepted but has no visual effect here since these paths
 * have no stroke, only fill.
 */
type NavIconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string };

export function HomeIcon({ strokeWidth: _strokeWidth, ...props }: NavIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.5812 2.68627C12.2335 2.43791 11.7664 2.43791 11.4187 2.68627L1.9187 9.47198L3.08118 11.0994L11.9999 4.7289L20.9187 11.0994L22.0812 9.47198L12.5812 2.68627ZM19.5812 12.6863L12.5812 7.68627C12.2335 7.43791 11.7664 7.43791 11.4187 7.68627L4.4187 12.6863C4.15591 12.874 3.99994 13.177 3.99994 13.5V20C3.99994 20.5523 4.44765 21 4.99994 21H18.9999C19.5522 21 19.9999 20.5523 19.9999 20V13.5C19.9999 13.177 19.844 12.874 19.5812 12.6863Z" />
    </svg>
  );
}

export function SearchNavIcon({ strokeWidth: _strokeWidth, ...props }: NavIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.031 16.6168L22.3137 20.8995L20.8995 22.3137L16.6168 18.031C15.0769 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.0769 18.031 16.6168ZM16.0247 15.8748C17.2475 14.6146 18 12.8956 18 11C18 7.1325 14.8675 4 11 4C7.1325 4 4 7.1325 4 11C4 14.8675 7.1325 18 11 18C12.8956 18 14.6146 17.2475 15.8748 16.0247L16.0247 15.8748ZM12.1779 7.17624C11.4834 7.48982 11 8.18846 11 9C11 10.1046 11.8954 11 13 11C13.8115 11 14.5102 10.5166 14.8238 9.82212C14.9383 10.1945 15 10.59 15 11C15 13.2091 13.2091 15 11 15C8.79086 15 7 13.2091 7 11C7 8.79086 8.79086 7 11 7C11.41 7 11.8055 7.06167 12.1779 7.17624Z" />
    </svg>
  );
}

export function UploadNavIcon({ strokeWidth: _strokeWidth, ...props }: NavIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5ZM11 11V7H13V11H17V13H13V17H11V13H7V11H11Z" />
    </svg>
  );
}

export function MessageNavIcon({ strokeWidth: _strokeWidth, ...props }: NavIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19.4999 2.00098C20.0944 2.00063 20.6989 2.15072 21.2499 2.46875C22.924 3.43525 23.4977 5.57598 22.5312 7.25001L15.0311 20.2403C14.0646 21.9142 11.9238 22.488 10.2498 21.5215C9.41372 21.0387 8.85157 20.2605 8.61994 19.3975L7.1209 13.8028L15.8905 8.73927C16.3687 8.46311 16.5327 7.85126 16.2567 7.37306C15.9805 6.89505 15.3686 6.73096 14.8905 7.00685L6.12089 12.0713L2.02515 7.97462C0.658428 6.60771 0.658787 4.39204 2.02515 3.02539C2.65731 2.39319 3.53383 2.00021 4.49978 2L19.4999 2.00098Z" />
    </svg>
  );
}

export function ProfileNavIcon({ strokeWidth: _strokeWidth, ...props }: NavIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 8C12.5523 8 13 8.44772 13 9C13 9.55228 12.5523 10 12 10C11.4477 10 11 9.55228 11 9C11 8.44772 11.4477 8 12 8ZM12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12ZM12 15C13.1046 15 14 15.8954 14 17H16C16 14.7909 14.2091 13 12 13C9.79086 13 8 14.7909 8 17H10C10 15.8954 10.8954 15 12 15Z" />
    </svg>
  );
}

/**
 * The exact user-supplied glyph (mobile/src/assets/feddliveiconS.svg,
 * same file the app's own feed Live icon uses) - a camera-body silhouette
 * with a small "LIVE" badge plate on it. Injected as raw markup
 * (dangerouslySetInnerHTML) rather than hand-converted to JSX - it has
 * defs/clipPaths and four separately-transformed letter paths for "LIVE",
 * and a manual camelCase JSX port of that (clip-path -> clipPath,
 * fill-opacity -> fillOpacity, four nested <g transform>s...) is exactly
 * the kind of conversion that quietly drops a letter or breaks a
 * transform. This is the file's own markup, unmodified.
 *
 * The source uses exactly two colors, always paired opposite each other
 * for contrast: the body + the LIVE lettering (#000000), and the plate
 * they sit on (#ffffff) - kept as-is here (black icon, per direction),
 * which is also just the file's own original colors, correct for this
 * sidebar's light background. The app's version of this same icon inverts
 * both together for its dark header - never one color without the other,
 * or the plate and its text collapse into each other and the badge
 * disappears.
 */
const LIVE_ICON_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 810 809.999993" version="1.0" width="100%" height="100%"><defs><clipPath id="b8e05610f7"><path d="M 63 26 L 747.78125 26 L 747.78125 810 L 63 810 Z M 63 26 " clip-rule="nonzero"/></clipPath><clipPath id="94b483f762"><path d="M 268.855469 290.34375 L 573.753906 290.34375 L 573.753906 595.246094 L 268.855469 595.246094 Z M 268.855469 290.34375 " clip-rule="nonzero"/></clipPath><clipPath id="ec70e3c6a4"><path d="M 0.855469 0.34375 L 305.753906 0.34375 L 305.753906 305.246094 L 0.855469 305.246094 Z M 0.855469 0.34375 " clip-rule="nonzero"/></clipPath><clipPath id="0e660409d0"><rect x="0" width="306" y="0" height="306"/></clipPath><clipPath id="6df88cd508"><rect x="0" width="426" y="0" height="182"/></clipPath></defs><g clip-path="url(#b8e05610f7)"><path fill="#000000" d="M 183.65625 150.644531 L 326.804688 150.644531 L 246.160156 70.019531 C 236.078125 59.941406 236.078125 43.816406 246.160156 33.738281 C 256.238281 23.660156 272.367188 23.660156 282.449219 33.738281 L 394.953125 146.207031 C 401 152.253906 411.886719 152.253906 417.9375 146.207031 L 530.4375 33.738281 C 540.519531 23.660156 556.648438 23.660156 566.730469 33.738281 C 576.8125 43.816406 576.8125 59.941406 566.730469 70.019531 L 486.082031 150.644531 L 626.007812 150.644531 C 692.539062 150.644531 747.378906 205.066406 747.378906 271.984375 L 747.378906 623.507812 C 747.378906 666.238281 724.394531 705.746094 688.507812 727.511719 L 688.507812 789.191406 C 688.507812 803.300781 677.21875 814.992188 663.105469 814.992188 C 648.992188 814.992188 637.699219 803.300781 637.699219 789.191406 L 637.699219 744.042969 C 637.699219 744.042969 311.484375 744.445312 174.382812 744.042969 L 174.382812 788.789062 C 174.382812 802.898438 163.09375 814.589844 148.980469 814.589844 C 134.867188 814.589844 123.574219 802.898438 123.574219 788.789062 L 123.574219 727.917969 C 86.476562 706.550781 63.089844 666.238281 63.089844 623.105469 L 63.089844 271.582031 C 63.089844 205.066406 117.527344 150.238281 184.464844 150.238281 Z M 363.097656 554.574219 C 363.097656 568.683594 351.804688 580.375 337.691406 580.375 C 323.578125 580.375 311.886719 569.085938 311.886719 554.976562 C 311.484375 519.90625 311.886719 461.453125 311.886719 412.269531 L 311.886719 362.6875 C 311.886719 342.933594 323.175781 326.40625 341.726562 319.148438 C 358.660156 312.296875 380.839844 313.910156 395.757812 324.792969 L 519.957031 414.6875 C 532.050781 423.15625 539.714844 436.457031 539.3125 451.375 C 539.3125 466.691406 531.246094 479.59375 518.746094 487.65625 L 423.984375 550.945312 C 412.292969 558.605469 396.160156 555.378906 388.5 543.6875 C 380.839844 532 384.066406 515.875 395.757812 508.214844 L 482.050781 450.566406 L 363.097656 365.105469 C 363.097656 365.105469 362.695312 535.625 363.097656 554.574219 Z M 626.007812 201.839844 L 183.65625 201.839844 C 145.351562 201.839844 113.898438 233.285156 113.898438 271.582031 L 113.898438 623.105469 C 113.898438 661.402344 145.351562 692.84375 183.65625 692.84375 L 626.007812 692.84375 C 664.3125 692.84375 695.765625 661.402344 695.765625 623.105469 L 695.765625 271.582031 C 695.765625 233.285156 664.3125 201.839844 626.007812 201.839844 Z M 626.007812 201.839844 " fill-opacity="1" fill-rule="nonzero"/></g><g clip-path="url(#94b483f762)"><g transform="matrix(1, 0, 0, 1, 268, 290)"><g clip-path="url(#0e660409d0)"><g clip-path="url(#ec70e3c6a4)"><path fill="#ffffff" d="M 0.855469 0.34375 L 305.753906 0.34375 L 305.753906 305.246094 L 0.855469 305.246094 Z M 0.855469 0.34375 " fill-opacity="1" fill-rule="nonzero"/></g></g></g></g><g transform="matrix(1, 0, 0, 1, 192, 356)"><g clip-path="url(#6df88cd508)"><g fill="#000000" fill-opacity="1"><g transform="translate(1.032738, 146.255969)"><g><path d="M 12.28125 -114.109375 L 48.921875 -114.109375 L 48.921875 -29.1875 L 107.484375 -29.1875 L 107.484375 0 L 12.28125 0 Z M 12.28125 -114.109375 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(111.657222, 146.255969)"><g><path d="M 13.9375 0 L 13.9375 -114.109375 L 50.59375 -114.109375 L 50.59375 0 Z M 13.9375 0 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(176.174328, 146.255969)"><g><path d="M 43.296875 0 L 2.8125 -114.109375 L 41.96875 -114.109375 L 64.84375 -37.8125 L 65.515625 -37.8125 L 88.5625 -114.109375 L 126.046875 -114.109375 L 85.75 0 Z M 43.296875 0 "/></g></g></g><g fill="#000000" fill-opacity="1"><g transform="translate(305.208578, 146.255969)"><g><path d="M 12.28125 -114.109375 L 110.953125 -114.109375 L 110.953125 -86.75 L 48.921875 -86.75 L 48.921875 -70.984375 L 102 -70.984375 L 102 -44.78125 L 48.921875 -44.78125 L 48.921875 -27.359375 L 112.125 -27.359375 L 112.125 0 L 12.28125 0 Z M 12.28125 -114.109375 "/></g></g></g></g></g></svg>';

export function LiveNavIcon({ strokeWidth: _strokeWidth, className }: NavIconProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: LIVE_ICON_MARKUP }}
    />
  );
}
