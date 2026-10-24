// Base menu data carries placeholder paths (/menu/*.jpg) that don't exist yet.
// Only operator-uploaded (/uploads/) or remote (http) images are rendered as real photos.
// (Plain module, so both server pages and client components can use it.)
export function realPhoto(src?: string): string | undefined {
  if (!src) return undefined;
  return src.startsWith("/uploads/") || src.startsWith("http") ? src : undefined;
}

// Menu photos are stored on Cloudinary and delivered as "f_auto,q_auto,w_900,c_limit" (see server/storage.ts).
// The same photo is offered in smaller widths too, so a phone showing two dishes per row downloads a
// ~10 KB 320px image instead of the ~45 KB 900px one.
const CLOUDINARY_MENU = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)f_auto,q_auto,w_900,c_limit\/(.+)$/;
export const PHOTO_WIDTHS = [320, 480, 640, 900];

/** The Cloudinary address of a menu photo at one width (or the address unchanged if it isn't one). */
export function photoAtWidth(src: string, width: number): string {
  const m = CLOUDINARY_MENU.exec(src);
  return m ? `${m[1]}f_auto,q_auto,w_${width},c_limit/${m[2]}` : src;
}

/** `srcSet` for a menu photo, so the browser picks the smallest size that looks sharp; undefined otherwise. */
export function photoSrcSet(src: string): string | undefined {
  return CLOUDINARY_MENU.test(src) ? PHOTO_WIDTHS.map((w) => `${photoAtWidth(src, w)} ${w}w`).join(", ") : undefined;
}
